import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardWorld, type OnboardData } from '@/canvaslearn/onboard'
import { useLessonStore } from '@/store/lessonStore'
import { apiClient } from '@/lib/api'
import type { StudentProfile } from '@hivelearn/core'

export function OnboardWorldPage() {
  const navigate = useNavigate()
  const { setPerfil, completeOnboarding } = useLessonStore()
  const [error, setError] = useState('')

  const handleComplete = async (data: OnboardData) => {
    setError('')
    try {
      const result = await apiClient<{ alumnoId: string; perfil: StudentProfile }>(
        '/api/hivelearn/student-profile',
        {
          method: 'POST',
          body: { nombre: data.nombre, nickname: data.nickname, edad: data.edad },
        }
      )
      localStorage.setItem('hivelearn-student-uuid', result.alumnoId)
      setPerfil(result.perfil)
      completeOnboarding()
      navigate('/nueva-sesion')
    } catch {
      setError('No se pudo guardar el perfil. Intenta de nuevo.')
    }
  }

  return (
    <div className="relative w-full h-full">
      <OnboardWorld onComplete={handleComplete} />
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-950/90 text-red-300 text-xs px-4 py-2.5 rounded-xl border border-red-500/30 backdrop-blur-sm">
          {error}
        </div>
      )}
    </div>
  )
}
