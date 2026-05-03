extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"astronomia": {
		"titulo": "Astronomía Chibcha",
		"lecciones": [
			{"titulo": "Los Muiscas y las Estrellas", "contenido": "Los muiscas de Colombia fueron grandes astrónomos. Descubrieron que el año tiene 365 días y usaban un calendario de oro llamado 'Calendario Muisca'."},
			{"titulo": "El Sol y la Luna", "contenido": "Los chibchas adoraban al Sol (Sua) y a la Luna (Chía). Creían que Chía lloraba cuando había eclipse, y que el Sol nascía cada mañana del lago de Bogotá."},
			{"titulo": "Las Constelaciones", "contenido": "Los muiscas veían figuras en las estrellas. La 'Cruz del Sur' era importante para navegar. También observaban las Pléyades para saber cuándo sembrar."},
			{"titulo": "El Dorado", "contenido": "La leyenda del Dorado comenzó con los muiscas. Cada año cubrían a su líder con polvo de oro y lo bañaban en el lago de Guatavita. ¡Era una ceremonia de renovación!"}
		],
		"xp": 50
	},
	"medicina": {
		"titulo": "Medicina Tradicional",
		"ejercicios": [
			{"pregunta": "Los muiscas usaban plantas para:", "opciones": ["Solo decoración", "Medicina y rituales", "Solo comida", "Construcción"], "respuesta": 1},
			{"pregunta": "¿Qué mineral usaban los muiscas para sus rituales?", "opciones": ["Plata", "Cobre", "Oro", "Bronce"], "respuesta": 2},
			{"pregunta": "El calendario muisca tenía:", "preguntas": ["365 días", "360 días", "400 días", "300 días"], "respuesta": 0},
			{"pregunta": "El 'Dorado' era:", "opciones": ["Un rey", "Una leyenda", "Una ciudad", "Un rio"], "respuesta": 1},
			{"pregunta": "Los muiscas vivían en:", "opciones": ["Amazonas", "Llanuras de Bogotá", "Costa", "Montañas"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Muisca",
		"preguntas": [
			{"pregunta": "¿Cómo llamaban los muiscas al Sol?", "opciones": ["Chía", "Sua", "Bochica", "Nenc"], "respuesta": 1},
			{"pregunta": "El calendario de los muiscas estaba hecho de:", "opciones": ["Madera", "Piedra", "Oro", "Barro"], "respuesta": 2},
			{"pregunta": "La ceremonia del Dorado se hacía en:", "opciones": ["Río Magdalena", "Lago de Guatavita", "Cerro de Monserrate", "Cañón del Chicamocha"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_cham()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_cham() -> void:
	var cham = $ChamContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -40), Vector2(30, 0), Vector2(20, 40), Vector2(-20, 40), Vector2(-30, 0)])
	cuerpo.color = Color(0.3, 0.2, 0.15, 1)
	cham.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(0, -55), Vector2(15, -70), Vector2(0, -65), Vector2(-15, -70)])
	cabeza.color = Color(0.35, 0.25, 0.2, 1)
	cham.add_child(cabeza)
	
	var antifaz = Polygon2D.new()
	antifaz.polygon = PackedVector2Array([Vector2(-8, -60), Vector2(8, -60), Vector2(8, -52), Vector2(-8, -52)])
	antifaz.color = Color(0.9, 0.7, 0.2, 1)
	cham.add_child(antifaz)
	
	var oro1 = Polygon2D.new()
	oro1.polygon = PackedVector2Array([Vector2(-15, -45), Vector2(-10, -55), Vector2(-5, -45)])
	oro1.color = Color(0.9, 0.8, 0.2, 1)
	cham.add_child(oro1)
	
	var oro2 = Polygon2D.new()
	oro2.polygon = PackedVector2Array([Vector2(5, -45), Vector2(10, -55), Vector2(15, -45)])
	oro2.color = Color(0.9, 0.8, 0.2, 1)
	cham.add_child(oro2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🐆 ¡Bienvenido a la Sierra de Bogotá! Soy Tota, el chamán muisca. Descubre los secretos de nuestra astronomía y medicina ancestral.")

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
		"astronomia": return true
		"medicina": return "astronomia_chibcha" in progreso
		"quiz": return "medicina_chibcha" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"astronomia": _mostrar_lecciones()
		"medicina": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["astronomia"]
	_mostrar_dialogo("🌟 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["astronomia"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌟 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("astronomia_chibcha", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["medicina"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("medicina_chibcha", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🌿 Medicina " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_chibcha", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Muisca"
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
		if modulo_actual == "medicina":
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
	$ChamContainer.scale.x = 1.0 + sin(Time.get_ticks_msec() * 0.003) * 0.05