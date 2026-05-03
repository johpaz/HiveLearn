extends Node2D

enum TipoZona {
	HISTORIA,
	EXCAVACION,
	QUIZ
}

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0
var objetos_enterrados: int = 0

const MODULOS = {
	"historia": {
		"titulo": "Historia y Cultura Maya",
		"lecciones": [
			{"titulo": "Los Mayas", "contenido": "Los mayas fueron una civilización increíble de Mesoamérica. Construyeron pirámides, crearon un calendario preciso y desarrollaron escritura jeroglífica."},
			{"titulo": "Los Cenotes", "concenido": "Los cenotes eran agujeros naturales en la tierra llenos de agua. Eran sagrados para los mayas y los usaban para obtener agua y hacer rituales."},
			{"titulo": "Escritura Maya", "contenido": "Los mayas tenían escritura con símbolos llamados glifos. Podían escribir sobre piedra, hueso y papel de árbol llamado amate."},
			{"titulo": "El Calendario", "contenido": "Los mayas tenían dos calendarios: uno de 365 días para la agricultura y otro de 260 días para rituales. ¡Eran muy avanzados!"}
		],
		"xp": 50
	},
	"excavacion": {
		"titulo": "Arqueología Maya",
		"ejercicios": [
			{"pregunta": "Los mayas construían sus ciudades sobre:", "opciones": ["Agua", "Montañas", "Bosques", "Desiertos"], "respuesta": 1},
			{"pregunta": "¿Qué símbolo maya representa el sol?", "opciones": ["☀️", "🌙", "⭐", "🔥"], "respuesta": 0},
			{"pregunta": "Los mayas practicaban un deporte ritual llamado:", "opciones": ["Fútbol", "Pelota", "Carrera", "Lucha"], "respuesta": 1},
			{"pregunta": "¿En qué año começou la civilización maya?", "opciones": ["1000 a.C.", "2000 a.C.", "3000 a.C.", "500 a.C."], "respuesta": 2},
			{"pregunta": "La Pirámide de Chichén Itzá está en:", "opciones": ["Guatemala", "México", "Belice", "Honduras"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Maya",
		"preguntas": [
			{"pregunta": "¿Cómo llamaban los mayas su escritura?", "opciones": ["Jeroglifos", "Códices", "Glifos mayas", "Todos los anteriores"], "respuesta": 3},
			{"pregunta": "¿Cuál era el alimento principal de los mayas?", "opciones": ["Carne", "Maíz", "Pescado", "Frutas"], "respuesta": 1},
			{"pregunta": "Los cenotes eran considerados:", "opciones": ["Pozos de agua", "Lugares sagrados", "Campos de juego", "Mercados"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI
@onready var hud_xp = $HUD/TopBar/HBox/XP
@onready var hud_vidas = $HUD/TopBar/HBox/VidasLabel
@onready var hud_racha = $HUD/TopBar/HBox/RachaLabel

func _ready() -> void:
	_dibujar_ix()
	_actualizar_hud()
	_mostrar_bienvenida_ix()
	_dibujar_escenario()

func _dibujar_escenario() -> void:
	for i in range(15):
		var roca = Polygon2D.new()
		var puntos = PackedVector2Array()
		var num_puntos = randi_range(5, 8)
		var radio = randf_range(15, 40)
		for j in range(num_puntos):
			var angulo = (TAU / num_puntos) * j + randf_range(-0.3, 0.3)
			puntos.append(Vector2(cos(angulo) * radio, sin(angulo) * radio))
		roca.polygon = puntos
		roca.color = Color(0.3 + randf() * 0.2, 0.25 + randf() * 0.15, 0.2, 1)
		roca.position = Vector2(randf() * 1280, 550 + randf() * 150)
		$Rocas.add_child(roca)

func _dibujar_ix() -> void:
	var cuerpo = $IxContainer/Cuerpo
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos.append(Vector2(cos(angulo) * 35, sin(angulo) * 45))
	cuerpo.polygon = puntos
	
	var cola = $IxContainer/Cola
	var puntos_cola = PackedVector2Array()
	puntos_cola.append(Vector2(-15, 0))
	puntos_cola.append(Vector2(0, 50))
	puntos_cola.append(Vector2(15, 0))
	cola.polygon = puntos_cola
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(8, 10)
	ojo1.color = Color(0.9, 0.9, 0.2, 1)
	ojo1.position = Vector2(-18, -12)
	$IxContainer/Ojos.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(8, 10)
	ojo2.color = Color(0.9, 0.9, 0.2, 1)
	ojo2.position = Vector2(10, -12)
	$IxContainer/Ojos.add_child(ojo2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		hud_xp.text = "XP: " + str(GameState.xp_actual)
		var vidas_str = ""
		for i in range(GameState.vidas):
			vidas_str += "❤️"
		hud_vidas.text = vidas_str
		hud_racha.text = "🔥 x" + str(GameState.racha)

func _mostrar_bienvenida_ix() -> void:
	_mostrar_dialogo("🐍 ¡Bienvenido a los Cenotes Mayas! Soy Ix, la abeja-serpiente. Excava los secretos de la antigua civilización maya. Descubre templos, artefactos y conocimientos perdidos!")

func _mostrar_dialogo(texto: String) -> void:
	$DialogoOverlay/Label.text = texto
	dialogo_overlay.visible = true
	dialogo_overlay.modulate.a = 0.0
	var tween = create_tween()
	tween.tween_property(dialogo_overlay, "modulate:a", 1.0, 0.3)

func _on_zona_pressed(tipo_zona: String) -> void:
	zona_actual = tipo_zona
	if not _verificar_acceso(tipo_zona):
		_mostrar_dialogo("🔒 ¡Primero completa las zonas anteriores!")
		return
	_iniciar_zona(tipo_zona)

func _verificar_acceso(tipo_zona: String) -> bool:
	var progreso = GameState.modulos_completados
	match tipo_zona:
		"historia":
			return true
		"excavacion":
			return "historia_mayas" in progreso
		"quiz":
			return "excavacion_mayas" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	objetos_enterrados = 0
	match tipo_zona:
		"historia":
			_mostrar_lecciones()
		"excavacion":
			_mostrar_excavacion()
		"quiz":
			_mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["historia"]
	_mostrar_dialogo("📖 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["historia"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("📖 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("historia_mayas", modulo["xp"])

func _mostrar_excavacion() -> void:
	objetos_enterrados = randi_range(3, 5)
	_mostrar_dialogo("⛏️ ¡Excava los secretos mayas! Busca objetos enterrados y responde preguntas sobre ellos.")
	await get_tree().create_timer(3.0).timeout
	_mostrar_ejercicio_excavacion()

func _mostrar_ejercicio_excavacion() -> void:
	var modulo = MODULOS["excavacion"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("excavacion_mayas", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "⛏️ Excavación " + str(pregunta_actual + 1) + " (" + str(objetos_enterrados) + " objetos encontrados)"
	vbox.get_node("Contenido").text = "🏺 " + ejercicio["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(ejercicio["opciones"].size()):
		var btn = Button.new()
		btn.text = ejercicio["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta_excavacion.bind(i, ejercicio["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true

func _on_respuesta_excavacion(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		objetos_enterrados += 1
		_mostrar_dialogo("✅ ¡Correcto! Has desenterrado un objeto maya. Encontrados: " + str(objetos_enterrados))
		pregunta_actual += 1
		await get_tree().create_timer(2.0).timeout
		_mostrar_ejercicio_excavacion()
	else:
		GameState.perder_vida()
		_actualizar_hud()
		_mostrar_dialogo("❌ No es correcto. Intenta de nuevo.")

func _mostrar_quiz() -> void:
	var modulo = MODULOS["quiz"]
	_mostrar_dialogo("🌊 ¡Quiz de los Cenotes! Demuestra tu conocimiento maya.")
	await get_tree().create_timer(3.0).timeout
	_mostrar_pregunta_quiz()

func _mostrar_pregunta_quiz() -> void:
	var modulo = MODULOS["quiz"]
	if pregunta_actual >= modulo["preguntas"].size():
		_completar_modulo("quiz_mayas", modulo["xp"])
		return
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🌊 Quiz " + str(pregunta_actual + 1)
	vbox.get_node("Contenido").text = pregunta["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(pregunta["opciones"].size()):
		var btn = Button.new()
		btn.text = pregunta["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta_quiz.bind(i, pregunta["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true

func _on_respuesta_quiz(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		_mostrar_dialogo("✅ ¡Correcto!")
		pregunta_actual += 1
		await get_tree().create_timer(2.0).timeout
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
	await get_tree().create_timer(3.0).timeout
	dialogo_overlay.visible = false

func _process(delta: float) -> void:
	var cuerpo = $IxContainer
	cuerpo.rotation = sin(Time.get_ticks_msec() * 0.003) * 0.05

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_tree().change_scene_to_file("res://scenes/hub/LaGranColmena.tscn")
	if event.is_action_pressed("ui_accept"):
		if dialogo_overlay.visible:
			dialogo_overlay.visible = false