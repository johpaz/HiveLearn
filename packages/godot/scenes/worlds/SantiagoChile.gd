extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"oceanografia": {
		"titulo": "Océano Pacífico Chileno",
		"lecciones": [
			{"titulo": "La Corriente de Humboldt", "contenido": "La corriente de Humboldt lleva agua fría desde la Antártida hasta Chile. Esto hace que el océano chileno sea muy rico en peces y vida marina."},
			{"titulo": "Ballenas y Mamíferos", "contenido": "Chile es el lugar donde más especies de ballenas vienen a criar. Las ballenas jorobadas y azules migran a las aguas chilenas cada año."},
			{"titulo": "Los Fiordos", "contenido": "El sur de Chile tiene fiordos impresionantes (canales profundos). El fiordo de los Glaciares tiene hielo que llega al mar. ¡Puedes ver icebergs en Chile!"},
			{"titulo": "La Biodiversidad Marina", "contenido": "Chile tiene más de 200 especies de peces, focas, nutrias, delfines y pingüinos. El Pingüino de Humboldt es endémico de Chile y Perú."}
		],
		"xp": 50
	},
	"deportes": {
		"titulo": "Deportes Chilenos",
		"ejercicios": [
			{"pregunta": "¿Qué brings agua fría a Chile?", "opciones": ["Corriente del Niño", "Corriente de Humboldt", "Corriente de Brasil", "Gulf Stream"], "respuesta": 1},
			{"pregunta": "¿Qué ballena migra a Chile a criar?", "opciones": ["Ballena gris", "Ballena jorobada", "Ballena azul", "Ballena killer"], "respuesta": 1},
			{"pregunta": "El Pingüino de Humboldt vive en:", "opciones": ["Argentina", "Chile y Perú", "Brasil", "Uruguay"], "respuesta": 1},
			{"pregunta": "El sur de Chile tiene:", "opciones": ["Desiertos", "Fiordos", "Selvas", "Pantanos"], "respuesta": 1},
			{"pregunta": "¿Cuántas especies de peces tiene Chile?", "opciones": ["50", "100", "200", "500"], "respuesta": 2}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Chileno",
		"preguntas": [
			{"pregunta": "Los fiordos están en:", "opciones": ["Norte de Chile", "Sur de Chile", "Centro de Chile", "Santiago"], "respuesta": 1},
			{"pregunta": "¿Qué sport es muy popular en Chile?", "opciones": ["Fútbol", "Básquetbol", "Críquet", "Béisbol"], "respuesta": 0},
			{"pregunta": "Los icebergs llegan al:", "opciones": ["Desierto", "Océano Pacífico", "Montañas", "Lagos"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_pinguino()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_pinguino() -> void:
	var pinguino = $PinguinoContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -20), Vector2(18, 0), Vector2(15, 35), Vector2(-15, 35), Vector2(-18, 0)])
	cuerpo.color = Color(0.15, 0.15, 0.2, 1)
	pinguino.add_child(cuerpo)
	
	var pecho = Polygon2D.new()
	pecho.polygon = PackedVector2Array([Vector2(-10, 10), Vector2(10, 10), Vector2(8, 30), Vector2(-8, 30)])
	pecho.color = Color(0.95, 0.95, 0.95, 1)
	pinguino.add_child(pecho)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(0, -20), Vector2(15, -30), Vector2(0, -35), Vector2(-15, -30)])
	cabeza.color = Color(0.15, 0.15, 0.2, 1)
	pinguino.add_child(cabeza)
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(3, 3)
	ojo1.color = Color(0.9, 0.8, 0.2, 1)
	ojo1.position = Vector2(-6, -27)
	pinguino.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(3, 3)
	ojo2.color = Color(0.9, 0.8, 0.2, 1)
	ojo2.position = Vector2(3, -27)
	pinguino.add_child(ojo2)
	
	var pico = Polygon2D.new()
	pico.polygon = PackedVector2Array([Vector2(-3, -22), Vector2(3, -22), Vector2(0, -15)])
	pico.color = Color(0.9, 0.5, 0.2, 1)
	pinguino.add_child(pico)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🐧 ¡Bienvenido a las costas de Chile! Soy Nico, el pingüino de Humboldt. Explora los fiordos, las ballenas y la rica vida marina del Pacífico sur.")

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
		"oceanografia": return true
		"deportes": return "oceanografia_chile" in progreso
		"quiz": return "deportes_chile" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"oceanografia": _mostrar_lecciones()
		"deportes": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["oceanografia"]
	_mostrar_dialogo("🌊 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["oceanografia"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌊 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("oceanografia_chile", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["deportes"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("deportes_chile", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "⚽ Deportes " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_chile", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Chileno"
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
		if modulo_actual == "deportes":
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