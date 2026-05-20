import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'
import LoginPage from './pages/LoginPage'
import { useAuthStore } from './store/useAuthStore'
import MediaErrorToast from './components/common/MediaErrorToast'

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
    return (
        <BrowserRouter>
            <MediaErrorToast />
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/room/:roomId"
                    element={
                        <PrivateRoute>
                            <RoomPage />
                        </PrivateRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}
