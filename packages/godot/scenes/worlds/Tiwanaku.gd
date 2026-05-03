extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"cosmovision": {
		"titulo": "Cosmovisión Aymara",
		"lecciones": [
			{"titulo": "El Tiempo Circular", "contenido": "Los aymaras tienen una visión circular del tiempo. No ven el tiempo como una línea, sino como un ciclo que se renueva. Por eso celebran el Año Nuevo aymara el 21 de junio."},
			{"titulo": "La Pachamama", "contenido": "Pachamama significa 'Madre Tierra'. Los aymaras le ofrecen respeto y agradecimiento. Cada año le dedican ceremonias y le piden permiso para sembrar."},
			{"titulo": "Los Apus", "contenido": "Los apus son los espíritus de las montañas. Los aymaras creen que cada montaña tiene un guardián espiritual que protege a las comunidades y da agua a las tierras."},
			{"titulo": "Tiwanaku", "contenido": "Tiwanaku fue una civilización anterior a los incas, ubicada en Bolivia. Construyeron monolitos enormes como el Puma Punku. Su conocimiento de astronomía era impresionante."}
		],
		"xp": 50
	},
	"filosofia": {
		"titulo": "Filosofía Aymara",
		"ejercicios": [
			{"pregunta": "El Año Nuevo aymara se celebra en:", "opciones": ["Enero", "Marzo", "Junio", "Septiembre"], "respuesta": 2},
			{"pregunta": "Pachamama significa:", "opciones": ["Padre Sol", "Madre Tierra", "Hermano Viento", "Abuelo Río"], "respuesta": 1},
			{"pregunta": "Los apus son:", "opciones": ["Animales", "Montañas", "Dioses", "Ríos"], "respuesta": 1},
			{"pregunta": "Tiwanaku está en:", "opciones": ["Perú", "Bolivia", "Chile", "Argentina"], "respuesta": 1},
			{"pregunta": "Los aymaras ven el tiempo como:", "opciones": ["Una línea", "Un círculo", "Una montaña", "Un río"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Aymara",
		"preguntas": [
			{"pregunta": "¿Qué construcción antigua está en Bolivia?", "opciones": ["Machu Picchu", "Tiwanaku", "Chavín", "Nazca"], "respuesta": 1},
			{"pregunta": "¿Qué ofrecen los aymaras a la Pachamama?", "opciones": ["Oro", "Comida y respeto", "Piedras", "Flores"], "respuesta": 1},
			{"pregunta": "El Puma Punku es un:", "opciones": ["Templo", "Monolito", "Puerta", "Palacio"], "respuesta": 2}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_vicuña()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_vicuña() -> void:
	var vicuña = $VicuñaContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -25), Vector2(20, 5), Vector2(15, 25), Vector2(-15, 25), Vector2(-20, 5)])
	cuerpo.color = Color(0.85, 0.75, 0.6, 1)
	vicuña.add_child(cuerpo)
	
	var cuello = Polygon2D.new()
	cuello.polygon = PackedVector2Array([Vector2(15, -25), Vector2(25, -50), Vector2(15, -55), Vector2(5, -30)])
	cuello.color = Color(0.9, 0.8, 0.65, 1)
	vicuña.add_child(cuello)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(15, -55), Vector2(28, -65), Vector2(18, -60)])
	cabeza.color = Color(0.85, 0.75, 0.6, 1)
	vicuña.add_child(cabeza)
	
	var oreja1 = Polygon2D.new()
	oreja1.polygon = PackedVector2Array([Vector2(20, -60), Vector2(18, -72), Vector2(24, -65)])
	oreja1.color = Color(0.8, 0.7, 0.55, 1)
	vicuña.add_child(oreja1)
	
	var oreja2 = Polygon2D.new()
	oreja2.polygon = PackedVector2Array([Vector2(24, -58), Vector2(26, -70), Vector2(30, -60)])
	oreja2.color = Color(0.8, 0.7, 0.55, 1)
	vicuña.add_child(oreja2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🦙 ¡Bienvenido a Tiwanaku! Soy Kallu, la vicuña sagrada. Descubre la profunda cosmovisión aymara y los misterios de esta antigua civilización.")

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
		"cosmovision": return true
		"filosofia": return "cosmovision_aymara" in progreso
		"quiz": return "filosofia_aymara" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"cosmovision": _mostrar_lecciones()
		"filosofia": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["cosmovision"]
	_mostrar_dialogo("🌀 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["cosmovision"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌀 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("cosmovision_aymara", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["filosofia"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("filosofia_aymara", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "📜 Filosofía " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_aymara", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Aymara"
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
		if modulo_actual == "filosofia":
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