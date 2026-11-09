import { InvalidCypherError } from "../../core/ports/cypher-reader/index.ts";

// The statement of the plan B starts with one of these: a read, never a command (`SHOW`, `FREE MEMORY`...).
const STARTING_WORDS = new Set(["MATCH", "OPTIONAL", "WITH", "UNWIND", "RETURN"]);

// Refused wherever they appear as words of the statement. The read transaction already refuses what writes
// the graph and what changes the database (checked on 2026-11-09, `docs/memgraph.md`); this list is the second
// layer, for what that transaction lets through: `LOAD CSV` reads the server's files and `CALL` runs
// procedures that write files or call URLs even when the database flags them as reads.
const REFUSED_WORDS = new Set([
  "CALL",
  "LOAD",
  "CREATE",
  "MERGE",
  "SET",
  "DELETE",
  "DETACH",
  "REMOVE",
  "FOREACH",
]);

// Checks that a statement is ONE read statement, before it goes to the database. It throws
// `InvalidCypherError`, with the reason in words, when it is not. It looks only at the code of the statement:
// text in quotes, in backticks and comments is not code, and a word after a dot is a property (`n.set`), so
// neither is judged.
//
// It is a guard, not a parser: it can refuse a statement that is fine (a label named `Set`), never accept one
// that writes through a word on the list, and a mistake in it still meets the read transaction.
export function assertReadOnlyCypher(statement: string): void {
  const code = withoutLiteralsAndComments(statement).trim().replace(/;$/, "").trim();
  if (code === "") throw new InvalidCypherError("the statement is empty");
  if (code.includes(";")) throw new InvalidCypherError("only one statement is accepted");

  const words = [...code.matchAll(/(?<![.\w$])[A-Za-z_]\w*/g)].map(([word]) => word.toUpperCase());

  const [first] = words;
  if (first === undefined || !STARTING_WORDS.has(first)) {
    throw new InvalidCypherError(
      "a statement must start with MATCH, OPTIONAL MATCH, WITH, UNWIND or RETURN",
    );
  }

  const refused = words.find((word) => REFUSED_WORDS.has(word));
  if (refused !== undefined) {
    throw new InvalidCypherError(
      `${refused} is not accepted: only reading statements are, and CALL and LOAD are refused too`,
    );
  }

  const memoryAt = words.findIndex(
    (word, index) => word === "QUERY" && words[index + 1] === "MEMORY",
  );
  if (memoryAt !== -1) {
    throw new InvalidCypherError(
      "do not write QUERY MEMORY LIMIT: the limit is given with the option memoryLimitMb",
    );
  }
}

// The statement with what is not code blanked out: texts in single or double quotes (a backslash escapes the
// next character), names in backticks, `//` comments and `/* */` comments. An open quote or comment is an
// error, because the guard could not tell where the code goes on.
function withoutLiteralsAndComments(statement: string): string {
  let code = "";
  let index = 0;

  while (index < statement.length) {
    const char = statement.charAt(index);
    const next = statement.charAt(index + 1);

    if (char === "/" && next === "/") {
      const end = statement.indexOf("\n", index);
      index = end === -1 ? statement.length : end;
      code += " ";
    } else if (char === "/" && next === "*") {
      const end = statement.indexOf("*/", index + 2);
      if (end === -1) throw new InvalidCypherError("a comment is opened and never closed");
      index = end + 2;
      code += " ";
    } else if (char === "'" || char === '"' || char === "`") {
      index = endOfQuoted(statement, index);
      code += " ";
    } else {
      code += char;
      index += 1;
    }
  }

  return code;
}

// Where the text that opens at `start` (with a quote or a backtick) ends: the index after the closing one.
function endOfQuoted(statement: string, start: number): number {
  const quote = statement.charAt(start);
  let index = start + 1;

  while (index < statement.length) {
    const char = statement.charAt(index);
    if (char === "\\" && quote !== "`") {
      index += 2;
    } else if (char === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  throw new InvalidCypherError("a quote is opened and never closed");
}
