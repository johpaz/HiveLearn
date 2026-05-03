import { useNavigate } from 'react-router-dom'
import { NuevaSesionWorld, type SessionData } from '@/canvaslearn/nueva-sesion'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { useLessonStore } from '@/store/lessonStore'

export function NuevaSesionWorldPage() {
  const navigate = useNavigate()
  const { perfil } = useLessonStore()
  const { setTema, setSessionId, setAlumnoId, setProgramaUuid } = useRioMundoStore()

  const handleLaunch = async (data: SessionData) => {
    const meta = `Tema: ${data.tema}. Objetivo: ${data.objetivo}.`
    setTema(meta)

    const alumnoId: string = (perfil as any)?.alumnoId ?? localStorage.getItem('hivelearn-student-uuid') ?? ''
    const sessionId = `rio-${Date.now()}`
    setAlumnoId(alumnoId)
    setSessionId(sessionId)

    try {
      const res = await fetch('/api/hivelearn/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumnoId, sessionId, tema: data.tema, objetivo: data.objetivo }),
      })
      const result = await res.json()
      if (result.programa_uuid) {
        setProgramaUuid(result.programa_uuid)
      }
    } catch { /* no bloquear navegación si falla el guardado */ }

    navigate('/rio')
  }

  return <NuevaSesionWorld onLaunch={handleLaunch} />
}
