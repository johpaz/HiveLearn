extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"volcanes": {
		"titulo": "Volcanes y Geología",
		"lecciones": [
			{"titulo": "La Cordillera de los Andes", "contenido": "Ecuador tiene la montaña más alta del mundo medida desde el centro de la Tierra: el Chimborazo. Sus picos alcanzan más de 6,000 metros sobre el nivel del mar."},
			{"titulo": "Volcanes Activos", "contenido": "Ecuador tiene muchos volcanes activos: Cotopaxi (el más alto del mundo activo), Cayambe, Tungurahua y el Reventador. La actividad volcánica crea suelos muy fértiles."},
			{"titulo": "Las Galápagos", "contenido": "Las islas Galápagos están en Ecuador y son un laboratorio natural único. Darwin desarrolló aquí su teoría de la evolución. Tienen especies que no existen en otro lugar."},
			{"titulo": "La Mitad del Mundo", "contenido": "Ecuador tiene la línea ecuatorial ( Mitad del Mundo). En ese punto, los objetos no hacen sombra al medio día. ¡Puedes estar en dos hemisferios a la vez!"}
		],
		"xp": 50
	},
	"ecologia": {
		"titulo": "Ecología Andina",
		"ejercicios": [
			{"pregunta": "¿Cuál es la montaña más alta del mundo desde el centro de la Tierra?", "opciones": ["Everest", "Chimborazo", "Aconcagua", "Huascarán"], "respuesta": 1},
			{"pregunta": "¿Cuál es el volcán activo más alto del mundo?", "opciones": ["Fujiyama", "Cotopaxi", "Kili", "Villarrica"], "respuesta": 1},
			{"pregunta": "Las Galápagos pertenecen a:", "opciones": ["Colombia", "Perú", "Ecuador", "Chile"], "respuesta": 2},
			{"pregunta": "¿Qué científico estudió las Galápagos?", "opciones": ["Einstein", "Darwin", "Newton", "Mendel"], "respuesta": 1},
			{"pregunta": "La Mitad del Mundo está en:", "opciones": ["Quito", "Guayaquil", "Cuenca", "Manta"], "respuesta": 0}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Ecuatoriano",
		"preguntas": [
			{"pregunta": "¿Cuántos volcanes activos tiene Ecuador?", "opciones": ["5", "10", "15", "20"], "respuesta": 2},
			{"pregunta": "Las Galápagos son:", "opciones": ["Un país", "Un archipiélago", "Un continente", "Un río"], "respuesta": 1},
			{"pregunta": "La línea ecuadora divide:", "opciones": ["Norte y Sur", "Este y Oeste", "Europa y Asia", "África y América"], "respuesta": 0}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_colibri()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_colibri() -> void:
	var colibri = $ColibriContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -10), Vector2(15, 5), Vector2(10, 15), Vector2(-10, 15), Vector2(-15, 5)])
	cuerpo.color = Color(0.2, 0.6, 0.4, 1)
	colibri.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(10, -5), Vector2(25, -10), Vector2(20, 0)])
	cabeza.color = Color(0.25, 0.65, 0.45, 1)
	colibri.add_child(cabeza)
	
	var pico = Polygon2D.new()
	pico.polygon = PackedVector2Array([Vector2(25, -8), Vector2(40, -5), Vector2(25, -2)])
	pico.color = Color(0.15, 0.1, 0.05, 1)
	colibri.add_child(pico)
	
	var ala1 = Polygon2D.new()
	ala1.polygon = PackedVector2Array([Vector2(-5, -5), Vector2(-20, -25), Vector2(-10, -10)])
	ala1.color = Color(0.15, 0.5, 0.35, 1)
	colibri.add_child(ala1)
	
	var ala2 = Polygon2D.new()
	ala2.polygon = PackedVector2Array([Vector2(5, 0), Vector2(20, -20), Vector2(10, 5)])
	ala2.color = Color(0.15, 0.5, 0.35, 1)
	colibri.add_child(ala2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🐦 ¡Bienvenido a los Andes ecuatorianos! Soy Inti, el colibrí esmeralda. Descubre los volcanes, las Galápagos y la ciencia de la Mitad del Mundo.")

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
		"volcanes": return true
		"ecologia": return "volcanes_ecuador" in progreso
		"quiz": return "ecologia_ecuador" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"volcanes": _mostrar_lecciones()
		"ecologia": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["volcanes"]
	_mostrar_dialogo("🌋 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["volcanes"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌋 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("volcanes_ecuador", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["ecologia"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("ecologia_ecuador", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🌿 Ecología " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_ecuador", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Ecuatoriano"
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
		if modulo_actual == "ecologia":
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
	$ColibriContainer.rotation = sin(Time.get_ticks_msec() * 0.005) * 0.1