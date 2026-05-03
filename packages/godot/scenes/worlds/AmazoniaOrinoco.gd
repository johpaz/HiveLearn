extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"biodiversidad": {
		"titulo": "Biodiversidad del Orinoco",
		"lecciones": [
			{"titulo": "El Río Orinoco", "contenido": "El Orinoco es uno de los ríos más largos de América (2,140 km). Nace en Venezuela y atraviesa Colombia. Es hogar de miles de especies de peces, delfines y caimanes."},
			{"titulo": "La Selva Amazónica", "contenido": "Venezuela tiene parte de la selva amazónica, el bosque tropical más grande del mundo. Aquí viven jaguares, monos, loros y miles de plantas únicas."},
			{"titulo": "Los Peces del Orinoco", "contenido": "El Orinoco tiene más de 1,000 especies de peces. El pez más grande es el paiche (puede pesar 200 kg). También hay rayas de agua dulce y sardinas."},
			{"titulo": "El Salto Ángel", "contenido": "El Salto Ángel (Kukenán) es la cascada más alta del mundo (979 m). Está en el Parque Nacional Canaima, en Venezuela. ¡Es 3 veces más alta que el Niagara!"}
		],
		"xp": 50
	},
	"geografia": {
		"titulo": "Geografía Venezolana",
		"ejercicios": [
			{"pregunta": "¿Cuánto mide el río Orinoco?", "opciones": ["1,000 km", "2,140 km", "3,000 km", "500 km"], "respuesta": 1},
			{"pregunta": "El Salto Ángel mide aproximadamente:", "opciones": ["300 m", "500 m", "979 m", "1200 m"], "respuesta": 2},
			{"pregunta": "El paiche puede pesar hasta:", "opciones": ["50 kg", "100 kg", "200 kg", "300 kg"], "respuesta": 2},
			{"pregunta": "El Salto Ángel está en:", "opciones": ["Amazonas", "Canaima", "Los Roques", "Mérida"], "respuesta": 1},
			{"pregunta": "Venezuela tiene acceso al:", "opciones": ["Océano Pacífico", "Mar Caribe", "Océano Atlántico", "Ambos B"], "respuesta": 3}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Venezolano",
		"preguntas": [
			{"pregunta": "¿Cuál es la cascada más alta del mundo?", "opciones": ["Niagara", "Iguazú", "Salto Ángel", "Kukenán"], "respuesta": 2},
			{"pregunta": "El Orinoco atraviesa:", "opciones": ["Solo Venezuela", "Venezuela y Colombia", "Venezuela y Brasil", "Todos"], "respuesta": 1},
			{"pregunta": "¿Cuántas especies de peces hay en el Orinoco?", "opciones": ["100", "500", "1,000", "10,000"], "respuesta": 2}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_delfin()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_delfin() -> void:
	var delfin = $DelfinContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(-30, 0), Vector2(30, 0), Vector2(40, -15), Vector2(30, -25), Vector2(-20, -20), Vector2(-35, -10)])
	cuerpo.color = Color(0.4, 0.6, 0.7, 1)
	delfin.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(30, -25), Vector2(55, -15), Vector2(45, -5), Vector2(30, -15)])
	cabeza.color = Color(0.45, 0.65, 0.75, 1)
	delfin.add_child(cabeza)
	
	var melon = Polygon2D.new()
	melon.polygon = PackedVector2Array([Vector2(45, -15), Vector2(55, -10), Vector2(48, -5)])
	melon.color = Color(0.5, 0.7, 0.8, 1)
	delfin.add_child(melon)
	
	var ojo = ColorRect.new()
	ojo.custom_minimum_size = Vector2(5, 5)
	ojo.color = Color(0.1, 0.1, 0.1, 1)
	ojo.position = Vector2(40, -18)
	delfin.add_child(ojo)
	
	var aleta = Polygon2D.new()
	aleta.polygon = PackedVector2Array([Vector2(-5, -15), Vector2(0, -35), Vector2(10, -15)])
	aleta.color = Color(0.35, 0.55, 0.65, 1)
	delfin.add_child(aleta)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🐬 ¡Bienvenido a las aguas del Orinoco! Soy Maki el delfín rosado. Explora la increíble biodiversidad de Venezuela y el mágico Salto Ángel.")

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
		"biodiversidad": return true
		"geografia": return "biodiversidad_orinoco" in progreso
		"quiz": return "geografia_venezuela" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"biodiversidad": _mostrar_lecciones()
		"geografia": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["biodiversidad"]
	_mostrar_dialogo("🌊 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["biodiversidad"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌊 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("biodiversidad_orinoco", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["geografia"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("geografia_venezuela", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🗺️ Geografía " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_venezuela", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Venezolano"
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
		if modulo_actual == "geografia":
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
	$DelfinContainer.position.y += sin(Time.get_ticks_msec() * 0.004) * 0.5