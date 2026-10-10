import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DocumentListPage from './pages/DocumentListPage.jsx'
import DocumentCreatePage from './pages/DocumentCreatePage.jsx'
import DocumentDetailPage from './pages/DocumentDetailPage.jsx'
import DocumentEditPage from './pages/DocumentEditPage.jsx'
import StudentExamListPage from './pages/StudentExamListPage.jsx'
import StudentExamPage from './pages/StudentExamPage.jsx'
import SubmissionDetailPage from './pages/SubmissionDetailPage.jsx'
import SubmissionsPage from './pages/SubmissionsPage.jsx'
import TurnoDetailPage from './pages/TurnoDetailPage.jsx'
import TurnoListPage from './pages/TurnoListPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute role="profesor">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/documentos" element={<DocumentListPage />} />
        <Route path="/documentos/nuevo" element={<DocumentCreatePage />} />
        <Route path="/documentos/:id" element={<DocumentDetailPage />} />
        <Route path="/documentos/:id/editar" element={<DocumentEditPage />} />
        <Route path="/documentos/:id/entregas/:entregaId" element={<SubmissionDetailPage />} />
        <Route path="/entregas" element={<SubmissionsPage />} />
        <Route path="/documentos/:id/turnos/:turnoId" element={<TurnoDetailPage />} />
        <Route path="/turnos" element={<TurnoListPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute role="alumno">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/alumno" element={<StudentExamListPage />} />
        <Route path="/alumno/parciales/:id" element={<StudentExamPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
