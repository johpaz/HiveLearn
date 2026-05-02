import { useNavigate } from 'react-router-dom'
import { NuevaSesionWorld, type SessionData } from '@/canvaslearn/nueva-sesion'
import { useLessonStore } from '@/store/lessonStore'

export function NuevaSesionWorldPage() {
  const navigate = useNavigate()
  const { perfil, setMeta } = useLessonStore()

  const handleLaunch = (data: SessionData) => {
    const meta = `Tema: ${data.tema}. Objetivo: ${data.objetivo}.`
    setMeta(meta)
    navigate('/hivelearn-swarm', { state: { perfil, meta } })
  }

  return <NuevaSesionWorld onLaunch={handleLaunch} />
}
