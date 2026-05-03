extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"programacion": {
		"titulo": "Introducción a la Programación",
		"lecciones": [
			{"titulo": "¿Qué es Programar?", "contenido": "Programar es darle instrucciones a una computadora para que haga tareas. Los programas están en todas partes: videojuegos, apps de celular, robots, y hasta en tu consola de juegos."},
			{"titulo": "Lenguajes de Programación", "contenido": "Los lenguajes son como idiomas para hablar con computadoras. Python es fácil para empezar, JavaScript hace páginas web, y Lua hace videojuegos."},
			{"titulo": "Bloques de Código", "contenido": "El código se organiza en bloques: variables (cajas donde guardamos datos), funciones (recetas con pasos), y condicionales (decisiones SI/NO)."},
			{"titulo": "Pensamiento Computacional", "contenido": "Programar enseña a pensar lógicamente: dividir problemas grandes en partes pequeñas, encontrar patrones, y crear soluciones paso a paso."}
		],
		"xp": 50
	},
	"robotica": {
		"titulo": "Robótica y Creatividad",
		"ejercicios": [
			{"pregunta": "Programar significa:", "opciones": ["Jugar videojuegos", "Dar instrucciones a computadoras", "Dibujar", "Cantar"], "respuesta": 1},
			{"pregunta": "¿Para qué sirve Python?", "opciones": ["Solo para juegos", "Para muchas cosas (datos, web, IA)", "Solo para cálculo", "Para dibujar"], "respuesta": 1},
			{"pregunta": "¿Qué son las variables?", "opciones": ["Errores", "Cajas para guardar datos", "Juegos", "Colores"], "respuesta": 1},
			{"pregunta": "Las funciones son:", "opciones": ["Errores", "Recetas con pasos", "Imágenes", "Sonidos"], "respuesta": 1},
			{"pregunta": "¿Qué lenguaje hace páginas web?", "opciones": ["Python", "JavaScript", "C++", "Swift"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Tech",
		"preguntas": [
			{"pregunta": "¿Qué es el pensamiento computacional?", "opciones": ["Usar computadoras", "Pensar lógicamente como una PC", "Dibujar con PC", "Solo jugar"], "respuesta": 1},
			{"preograma": "¿Qué hace JavaScript?", "opciones": ["Hace páginas web", "Solo hace cálculos", "Solo juegos", "Solo música"], "respuesta": 0},
			{"pregunta": "Los condicionales sirven para:", "opciones": ["Hacer música", "Tomar decisiones", "Dibujar", "Guardar datos"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_robot()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_robot() -> void:
	var robot = $RobotContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(-20, -10), Vector2(20, -10), Vector2(25, 30), Vector2(-25, 30)])
	cuerpo.color = Color(0.3, 0.5, 0.7, 1)
	robot.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(-25, -10), Vector2(25, -10), Vector2(20, -40), Vector2(-20, -40)])
	cabeza.color = Color(0.35, 0.55, 0.75, 1)
	robot.add_child(cabeza)
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(12, 12)
	ojo1.color = Color(0.2, 0.9, 0.4, 1)
	ojo1.position = Vector2(-12, -32)
	robot.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(12, 12)
	ojo2.color = Color(0.2, 0.9, 0.4, 1)
	ojo2.position = Vector2(0, -32)
	robot.add_child(ojo2)
	
	var antenna = Polygon2D.new()
	antenna.polygon = PackedVector2Array([Vector2(0, -40), Vector2(0, -55), Vector2(3, -52), Vector2(-3, -52)])
	antenna.color = Color(0.8, 0.8, 0.8, 1)
	robot.add_child(antenna)
	
	var bola = ColorRect.new()
	bola.custom_minimum_size = Vector2(6, 6)
	bola.color = Color(1, 0.3, 0.3, 1)
	bola.position = Vector2(-3, -58)
	robot.add_child(bola)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🤖 ¡Bienvenido a la Galaxia Digital! Soy Byte, el robot inteligente. Aprende a programar, crea tecnología y descubre cómo funcionan las computadoras.")

func _mostrar_dialogo(texto: String) -> void:
	$DialogoOverlay/Label.text = texto
	dialogo_overlay.visible = true

func _on_zona_pressed(tipo_zona: String) -> void:
	zona_actual = tipo_zona
	if not _verificar_acceso(tipo_zona):
		_mostrar_dialogo("🔒 ¡Primero completa las zonas anteriores!")
		return
	_iniciar_zona(tipo_zona)

func _verificar_acceso(tipo_zona: String) -> bool:
	var progreso = GameState.modulos_completados
	match tipo_zona:
		"programacion": return true
		"robotica": return "programacion_galaxia" in progreso
		"quiz": return "robotica_galaxia" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"programacion": _mostrar_lecciones()
		"robotica": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["programacion"]
	_mostrar_dialogo("💻 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["programacion"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("💻 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("programacion_galaxia", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["robotica"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("robotica_galaxia", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🤖 Robótica " + str(pregunta_actual + 1)
	vbox.get_node("Contenido").text = ejercicio["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(ejercicio["opciones"].size()):
		var btn = Button.new()
		btn.text = ejercicio["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta.bind(i, ejercicio["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true

func _mostrar_quiz() -> void:
	_mostrar_pregunta_quiz()

func _mostrar_pregunta_quiz() -> void:
	var modulo = MODULOS["quiz"]
	if pregunta_actual >= modulo["preguntas"].size():
		_completar_modulo("quiz_galaxia", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Tech"
	vbox.get_node("Contenido").text = pregunta["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(pregunta["opciones"].size()):
		var btn = Button.new()
		btn.text = pregunta["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta.bind(i, pregunta["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true

func _on_respuesta(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		_mostrar_dialogo("✅ ¡Correcto!")
		pregunta_actual += 1
		await get_tree().create_timer(2.0).timeout
		if modulo_actual == "robotica":
			_mostrar_ejercicio()
		else:
			_mostrar_pregunta_quiz()
	else:
		GameState.perder_vida()
		_actualizar_hud()
		_mostrar_dialogo("❌ No es correcto.")

func _completar_modulo(modulo_id: String, xp: int) -> void:
	GameState.completar_modulo(modulo_id)
	GameState.agregar_xp(xp)
	_actualizar_hud()
	_mostrar_dialogo("🎉 ¡Módulo completado! Has ganado " + str(xp) + " XP.")
	contenido_a2ui.visible = false

func _process(delta: float) -> void:
	$RobotContainer.position.y = 180 + sin(Time.get_ticks_msec() * 0.003) * 10