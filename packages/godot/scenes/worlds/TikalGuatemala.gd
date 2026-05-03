extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"arquitectura": {
		"titulo": "Arquitectura Maya",
		"lecciones": [
			{"titulo": "Tikal - La Ciudad Silenciosa", "contenido": "Tikal fue una de las ciudades mayas más grandes. Tiene pirámides de más de 60 metros de altura. Los monos aulladores viven en sus árboles hasta hoy."},
			{"titulo": "Las Pirámides Gemelas", "contenido": "En Tikal hay dos pirámides gemelas llamadas 'Templo I' y 'Templo II'. Una fue construida para un rey y la otra para su esposa. Tienen templos en la cima."},
			{"titulo": "La Astronomía en Tikal", "contenido": "Los mayas de Tikal eran expertos en astronomía. Usaban observatorios llamados 'Estruturas' para observar Venus y otros planetas. ¡Podían predecir eclipses!"},
			{"titulo": "La Selva come la Ciudad", "contenido": "Después de que los españoles llegaran, Tikal fue abandonada. La selva creció sobre las pirámides. No fue 'redescubierta' hasta 1848. Muchos secretos aún están ocultos."}
		],
		"xp": 50
	},
	"astronomia": {
		"titulo": "Astronomía Maya Guatemalteca",
		"ejercicios": [
			{"pregunta": "¿Cuánto miden las pirámides de Tikal?", "opciones": ["20 metros", "40 metros", "60 metros", "100 metros"], "respuesta": 2},
			{"pregunta": "Los mayas observaban:", "opciones": ["Solo la Luna", "Venus y planetas", "Solo el Sol", "Las nubes"], "respuesta": 1},
			{"pregunta": "Tikal fue abandonada en:", "opciones": ["Siglo XV", "Siglo XVI", "Siglo XVII", "Siglo XVIII"], "respuesta": 1},
			{"pregunta": "¿Cuándo fue 'redescubierta' Tikal?", "opciones": ["1700", "1800", "1848", "1900"], "respuesta": 2},
			{"pregunta": "En Tikal viven:", "opciones": ["Leones", "Monos aulladores", "Tigres", "Osos"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz de Tikal",
		"preguntas": [
			{"pregunta": "¿Cómo se llaman las pirámides gemelas?", "opciones": ["Templo I y II", "Templo Sol y Luna", "Pirámide Norte y Sur", "Templo Grande y Chico"], "respuesta": 0},
			{"pregunta": "Tikal está en:", "opciones": ["México", "Guatemala", "Belice", "Honduras"], "respuesta": 1},
			{"pregunta": "Los mayas predecían:", "opciones": ["Lluvia", "Eclipses", "Terremotos", "Volcanes"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_mono()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_mono() -> void:
	var mono = $MonoContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -15), Vector2(20, 10), Vector2(15, 30), Vector2(-15, 30), Vector2(-20, 10)])
	cuerpo.color = Color(0.4, 0.25, 0.15, 1)
	mono.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(0, -15), Vector2(18, -30), Vector2(0, -40), Vector2(-18, -30)])
	cabeza.color = Color(0.45, 0.3, 0.2, 1)
	mono.add_child(cabeza)
	
	var cara = Polygon2D.new()
	cara.polygon = PackedVector2Array([Vector2(-10, -28), Vector2(10, -28), Vector2(8, -18), Vector2(-8, -18)])
	cara.color = Color(0.9, 0.75, 0.65, 1)
	mono.add_child(cara)
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(4, 4)
	ojo1.color = Color(0.1, 0.1, 0.1, 1)
	ojo1.position = Vector2(-5, -25)
	mono.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(4, 4)
	ojo2.color = Color(0.1, 0.1, 0.1, 1)
	ojo2.position = Vector2(1, -25)
	mono.add_child(ojo2)
	
	var cola = Polygon2D.new()
	cola.polygon = PackedVector2Array([Vector2(-15, 20), Vector2(-25, 50), Vector2(-20, 50), Vector2(-10, 25)])
	cola.color = Color(0.35, 0.2, 0.12, 1)
	mono.add_child(cola)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🐒 ¡Bienvenido a Tikal! Soy Chaac, el mono aullador. Explora las pirámides gemelas y los secretos astronomicos de esta ciudad maya perdida en la selva.")

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
		"arquitectura": return true
		"astronomia": return "arquitectura_tikal" in progreso
		"quiz": return "astronomia_tikal" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"arquitectura": _mostrar_lecciones()
		"astronomia": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["arquitectura"]
	_mostrar_dialogo("🏛️ " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["arquitectura"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🏛️ " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("arquitectura_tikal", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["astronomia"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("astronomia_tikal", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🔭 Astronomía " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_tikal", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz de Tikal"
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
		if modulo_actual == "astronomia":
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
	$MonoContainer.position.x += sin(Time.get_ticks_msec() * 0.004) * 0.2