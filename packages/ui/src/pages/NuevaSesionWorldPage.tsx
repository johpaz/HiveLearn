import { useNavigate } from 'react-router-dom'
import { NuevaSesionWorld, type SessionData } from '@/canvaslearn/nueva-sesion'
import { useLessonStore } from '@/store/lessonStore'
import { apiClient } from '@/lib/api'

export function NuevaSesionWorldPage() {
  const navigate = useNavigate()
  const { perfil, setMeta } = useLessonStore()

  const handleLaunch = async (data: SessionData) => {
    const meta = `Tema: ${data.tema}. Objetivo: ${data.objetivo}.`
    setMeta(meta)

    const alumnoId: string = (perfil as any)?.alumnoId ?? localStorage.getItem('hivelearn-student-uuid') ?? ''
    const sessionId = `swarm-${Date.now()}`

    try {
      await apiClient('/api/hivelearn/session', {
        method: 'POST',
        body: { alumnoId, sessionId, tema: data.tema, objetivo: data.objetivo },
      })
    } catch { /* no bloquear navegación si falla el guardado */ }

    navigate('/hivelearn-swarm', { state: { perfil, meta, sessionId } })
  }

  return <NuevaSesionWorld onLaunch={handleLaunch} />
}
