import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface HowToUsePageProps {
  onBack: () => void
  onStart: () => void
}

export function HowToUsePage({ onBack, onStart }: HowToUsePageProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'steps' | 'faq'>('overview')

  const faqs = [
    {
      question: '¿Qué es HiveLearn?',
      answer: 'HiveLearn es una plataforma de aprendizaje adaptativo que usa un enjambre de 16 agentes de IA especializados para generar lecciones personalizadas según tu perfil, estilo de aprendizaje y objetivos.',
    },
    {
      question: '¿Cómo funciona el enjambre de agentes?',
      answer: 'Cuando inicias una lección, el agente coordinador delega tareas a 16 workers especializados: perfil, intención, estructura, explicación, ejercicios, quiz, retos, código, SVG, GIF, infografías, imágenes, gamificación, evaluación y feedback. Cada uno trabaja en paralelo para crear tu lección única.',
    },
    {
      question: '¿Es gratis?',
      answer: 'Sí, HiveLearn es open source y gratuito. Puedes usarlo con modelos locales (Ollama) sin costo, o conectar proveedores cloud con tu propia API key.',
    },
    {
      question: '¿Mis datos están seguros?',
      answer: 'Absolutamente. Todo se ejecuta localmente en tu dispositivo. Tus datos nunca salen de tu máquina a menos que uses proveedores cloud externos.',
    },
    {
      question: '¿Qué temas puedo aprender?',
      answer: 'Actualmente hay 14 temas disponibles: JavaScript, Python, HTML/CSS, TypeScript, Node.js, Algoritmos, IA básica, Prompt Engineering, Machine Learning, Agentes Hive, SQL, Análisis de Datos, Diseño UI y Figma.',
    },
    {
      question: '¿Puedo pausar y retomar una lección?',
      answer: 'Sí, tu progreso se guarda automáticamente. Puedes cerrar la aplicación y retomar exactamente donde lo dejaste.',
    },
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden pt-24 pb-16 px-4">
      {/* Ambient Mesh Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-hive-amber/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-hive-purple/5 blur-[120px]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12">
          <Button variant="ghost" onClick={onBack} className="mb-6 -ml-2 text-muted-foreground hover:text-hive-amber hover:bg-hive-amber/5 font-bold uppercase tracking-widest text-[10px]">
            ← Volver a la academia
          </Button>
          <h1 className="text-5xl font-black text-foreground mb-4 tracking-tight drop-shadow-sm">
            Guía de Aprendizaje
          </h1>
          <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Domina el arte de aprender con inteligencia artificial. Tu enjambre personal está listo para orquestar tu futuro.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-10 border-b border-border p-1 bg-secondary/20 rounded-xl w-fit">
          <button
            onClick={() => setActiveSection('overview')}
            className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all rounded-lg ${activeSection === 'overview'
                ? 'bg-background text-hive-amber shadow-sm border border-border'
                : 'text-muted-foreground/60 hover:text-foreground'
              }`}
          >
            📋 Visión General
          </button>
          <button
            onClick={() => setActiveSection('steps')}
            className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all rounded-lg ${activeSection === 'steps'
                ? 'bg-background text-hive-amber shadow-sm border border-border'
                : 'text-muted-foreground/60 hover:text-foreground'
              }`}
          >
            📝 Pasos Detallados
          </button>
          <button
            onClick={() => setActiveSection('faq')}
            className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all rounded-lg ${activeSection === 'faq'
                ? 'bg-background text-hive-amber shadow-sm border border-border'
                : 'text-muted-foreground/60 hover:text-foreground'
              }`}
          >
            ❓ Preguntas
          </button>
        </div>

        {/* Content */}
        {activeSection === 'overview' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Card className="border-border shadow-honey bg-background/80 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-hive-amber/10 text-hive-amber border border-hive-amber/20 shadow-sm">🎯</span>
                  ¿Qué es HiveLearn?
                </CardTitle>
                <CardDescription className="text-muted-foreground font-medium text-base">
                  Tu ecosistema inteligente de aprendizaje adaptativo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 text-muted-foreground font-medium leading-relaxed">
                <p>
                  HiveLearn es una plataforma educativa revolucionaria que utiliza un <strong className="text-hive-amber font-black">enjambre de 16 agentes de IA</strong> especializados para crear lecciones 100% personalizadas en tiempo real.
                </p>
                <p>
                  A diferencia de los sistemas tradicionales, HiveLearn analiza tu perfil, estilo de aprendizaje y objetivos para generar una experiencia educativa única que se adapta a tu ritmo y curiosidad.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
                  <div className="text-center p-6 bg-hive-amber/5 rounded-2xl border border-hive-amber/10 shadow-sm group hover:scale-105 transition-all">
                    <div className="text-4xl mb-3">🧠</div>
                    <div className="font-black text-foreground uppercase tracking-widest text-[10px] mb-1">Tecnología Swarm</div>
                    <div className="text-2xl font-black text-hive-amber">16 Agentes</div>
                  </div>
                  <div className="text-center p-6 bg-hive-purple/5 rounded-2xl border border-hive-purple/10 shadow-sm group hover:scale-105 transition-all">
                    <div className="text-4xl mb-3">⚡</div>
                    <div className="font-black text-foreground uppercase tracking-widest text-[10px] mb-1">Velocidad Neural</div>
                    <div className="text-2xl font-black text-hive-purple">Segundos</div>
                  </div>
                  <div className="text-center p-6 bg-hive-green/5 rounded-2xl border border-hive-green/10 shadow-sm group hover:scale-105 transition-all">
                    <div className="text-4xl mb-3">🎯</div>
                    <div className="font-black text-foreground uppercase tracking-widest text-[10px] mb-1">Adaptabilidad</div>
                    <div className="text-2xl font-black text-hive-green">100%</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-honey bg-background/80 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-hive-purple/10 text-hive-purple border border-hive-purple/20 shadow-sm">🐝</span>
                  El Enjambre Especializado
                </CardTitle>
                <CardDescription className="text-muted-foreground font-medium">
                  Una orquesta de agentes trabajando exclusivamente para ti
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { icon: '👤', name: 'Profile', desc: 'Analiza tu perfil' },
                    { icon: '🎯', name: 'Intent', desc: 'Define objetivos' },
                    { icon: '🗺️', name: 'Structure', desc: 'Mapa de ruta' },
                    { icon: '📖', name: 'Explainer', desc: 'Crea conceptos' },
                    { icon: '✏️', name: 'Exercise', desc: 'Retos prácticos' },
                    { icon: '❓', name: 'Quiz', desc: 'Validación' },
                    { icon: '⚡', name: 'Challenge', desc: 'Retos élite' },
                    { icon: '💻', name: 'Code', desc: 'Lógica pura' },
                    { icon: '📊', name: 'SVG', desc: 'Visualización' },
                    { icon: '🎞️', name: 'Gif', desc: 'Animación' },
                    { icon: '📈', name: 'Info', desc: 'Resúmenes' },
                    { icon: '🖼️', name: 'Image', desc: 'Inspiración' },
                    { icon: '🏆', name: 'Game', desc: 'Recompensas' },
                    { icon: '📝', name: 'Eval', desc: 'Examen final' },
                    { icon: '🧠', name: 'Feedback', desc: 'Mejora continua' },
                    { icon: '🐝', name: 'Coord', desc: 'Orquestador' },
                  ].map((agent) => (
                    <div key={agent.name} className="flex items-center gap-3 p-4 rounded-xl bg-secondary/10 border border-border hover:border-hive-amber/30 transition-all group">
                      <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">{agent.icon}</span>
                      <div className="min-w-0">
                        <div className="font-black text-foreground text-[10px] uppercase tracking-widest truncate">{agent.name}</div>
                        <div className="text-[10px] text-muted-foreground font-medium truncate">{agent.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === 'steps' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {[
              {
                step: '01',
                title: 'Configura tu Motor de IA',
                content: (
                  <div className="space-y-4">
                    <p>Antes de comenzar, conecta tu plataforma a la red neural:</p>
                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground font-medium">
                      <li>Navega a <span className="text-hive-amber font-bold">Configuración</span> en el menú lateral.</li>
                      <li>Selecciona un proveedor (Ollama para privacidad local, o cloud para potencia máxima).</li>
                      <li>Elige tu modelo preferido (Gemma, Llama, Claude, GPT).</li>
                      <li>Verifica la conexión y guarda.</li>
                    </ol>
                    <div className="p-5 bg-hive-blue/5 border border-hive-blue/20 rounded-2xl flex gap-4 items-start shadow-sm">
                      <span className="text-2xl">💡</span>
                      <div className="text-sm font-medium leading-relaxed">
                        <strong className="text-hive-blue font-black uppercase tracking-widest text-[10px] block mb-1">Recomendación Élite</strong>
                        Usa Ollama para una experiencia 100% privada y gratuita.
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                step: '02',
                title: 'Onboarding Conversacional',
                content: (
                  <div className="space-y-4">
                    <p>Habla con el Coordinador para definir tu camino:</p>
                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground font-medium">
                      <li>Haz clic en <span className="text-hive-amber font-bold">Nueva Sesión</span>.</li>
                      <li>Responde las preguntas de forma natural: el enjambre está escuchando.</li>
                      <li>Tu progreso se guarda encriptado localmente.</li>
                      <li>Puedes pausar la charla y volver en cualquier momento.</li>
                    </ol>
                  </div>
                ),
              },
              {
                step: '03',
                title: 'Visualiza la Orquestación Swarm',
                content: (
                  <div className="space-y-4 font-medium text-muted-foreground">
                    <p>Observa cómo los 16 agentes colaboran en el Swarm Canvas:</p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Las partículas representan la transferencia de conocimiento entre agentes.</li>
                      <li>Cada worker se ilumina cuando entrega su contribución.</li>
                      <li>El proceso es asíncrono y paralelo para una velocidad extrema.</li>
                    </ul>
                  </div>
                ),
              },
              {
                step: '04',
                title: 'Inmersión Educativa',
                content: (
                  <div className="space-y-4 font-medium text-muted-foreground">
                    <p>Tu lección personalizada está lista para ser explorada:</p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Navega por los nodos interactivos del mapa mental.</li>
                      <li>Gana <span className="text-hive-amber font-black">XP</span> por cada concepto dominado.</li>
                      <li>Desbloquea logros exclusivos por tu persistencia.</li>
                    </ul>
                  </div>
                ),
              },
              {
                step: '05',
                title: 'Validación y Maestría',
                content: (
                  <div className="space-y-4 font-medium text-muted-foreground">
                    <p>Demuestra tu dominio:</p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Completa la evaluación final diseñada por el EvaluationAgent.</li>
                      <li>Recibe retroalimentación instantánea sobre tus áreas de mejora.</li>
                      <li>Obtén tu rango académico y estadísticas finales.</li>
                    </ul>
                  </div>
                ),
              },
            ].map((section) => (
              <Card key={section.step} className="border-border shadow-honey bg-background/80 backdrop-blur-xl group hover:shadow-lg transition-all">
                <CardContent className="pt-8">
                  <div className="flex items-start gap-8">
                    <div className="text-6xl font-black text-hive-amber/10 group-hover:text-hive-amber/20 transition-colors select-none">
                      {section.step}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-black text-foreground mb-4 tracking-tight">
                        {section.title}
                      </h3>
                      <div className="text-base">
                        {section.content}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="text-center mt-12 pb-8">
              <Button onClick={onStart} className="h-14 px-10 rounded-2xl bg-hive-amber text-primary-foreground font-black uppercase tracking-widest text-xs hover:bg-hive-amber/90 shadow-honey active:scale-[0.98] transition-all">
                🚀 Comenzar mi camino
              </Button>
            </div>
          </div>
        )}

        {activeSection === 'faq' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {faqs.map((faq) => (
              <Card key={faq.question} className="border-border shadow-sm hover:shadow-honey transition-all bg-background/80 backdrop-blur-xl">
                <CardContent className="pt-6">
                  <h3 className="text-lg font-black text-foreground mb-3 flex items-center gap-3">
                    <span className="text-hive-amber">❓</span>
                    {faq.question}
                  </h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    {faq.answer}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
