import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout.tsx";
import { EntityListPage } from "./pages/entity-list-page.tsx";
import { EntityPage } from "./pages/entity-page.tsx";
import { ImportsPage } from "./pages/imports-page.tsx";
import { NotFoundPage } from "./pages/not-found-page.tsx";
import { StatusPage } from "./pages/status-page.tsx";
import { TypesPage } from "./pages/types-page.tsx";

// The screens and the address each one answers to. The router itself (a hash router) is chosen in
// `main.tsx`, so tests can mount this with a router of their own.
export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/browse" element={<TypesPage />} />
        <Route path="/browse/:type" element={<EntityListPage />} />
        <Route path="/entity" element={<EntityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
