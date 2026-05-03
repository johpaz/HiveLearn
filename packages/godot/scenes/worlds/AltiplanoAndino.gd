extends Node2D

enum TipoZona {
	LECCION,
	PUZZLE,
	QUIZ
}

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"leccion": {
		"titulo": "Matemáticas Andinas",
		"lecciones": [
			{"titulo": "Los Incas y los Números", "contenido": "Los antiguos incas usaban los quipus: cuerdas con nudos para contar. Cada tipo de nudo significaba un número diferente."},
			{"titulo": "El Sistema Decimal", "contenido": "Aunque no tenían письмо, los andinos usaban un sistema decimal. El número 10 se decia 'chunka'."},
			{"titulo": "Geometría en la Montaña", "contenido": "Los incas construían terrazas escalonadas usando geometría. Cada escalón tenía la misma anchura."},
			{"titulo": "Medir el Tiempo", "contenido": "Usaban el sol y las estrellas para medir el tiempo. El_INTIHUATANA era un reloj de piedra."}
		],
		"xp": 50
	},
	"puzzle": {
		"titulo": "Puzzles de Lógica",
		"ejercicios": [
			{"pregunta": "Si tienes 5 piedras y agregas 3 más, ¿cuántas tienes?", "opciones": ["6", "7", "8", "9"], "respuesta": 2},
			{"pregunta": "Completa: 10, 15, 20, ___", "opciones": ["22", "25", "30", "35"], "respuesta": 1},
			{"pregunta": "Si restas 8 de 15, ¿cuánto queda?", "opciones": ["5", "6", "7", "8"], "respuesta": 2},
			{"pregunta": "¿Cuántas esquinas tiene un cuadrado?", "opciones": ["3", "4", "5", "6"], "respuesta": 1},
			{"pregunta": "2 x 3 = ?", "opciones": ["4", "5", "6", "7"], "respuesta": 2}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz de Matemáticas",
		"preguntas": [
			{"pregunta": "¿Cuántos tipos de nudos usaban los incas?", "opciones": ["2", "3", "4", "5"], "respuesta": 1},
			{"pregunta": "El número 10 en quechua se dice:", "opciones": ["Killa", "Chunka", "Pusaq", "Kanchis"], "respuesta": 1},
			{"pregunta": "¿Qué forma tienen las terrazas incas?", "opciones": ["Circular", "Cuadrada", "Triangular", "Escalonada"], "respuesta": 3}
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
	_dibujar_kimi()
	_actualizar_hud()
	_mostrar_bienvenida_kimi()
	_dibujar_montanas()

func _dibujar_montanas() -> void:
	for i in range(5):
		var montana = Polygon2D.new()
		var puntos = PackedVector2Array()
		var base_x = i * 300 - 100
		var altura = randf_range(100, 200)
		puntos.append(Vector2(base_x, 600))
		puntos.append(Vector2(base_x + 150, 600 - altura))
		puntos.append(Vector2(base_x + 300, 600))
		montana.polygon = puntos
		montana.color = Color(0.2 + randf() * 0.1, 0.2, 0.25, 1)
		$Montanas.add_child(montana)

func _dibujar_kimi() -> void:
	var cuerpo = $KimiContainer/Cuerpo
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos.append(Vector2(cos(angulo) * 40, sin(angulo) * 50))
	cuerpo.polygon = puntos
	
	var ala_izq = $KimiContainer/AlaIzq
	var puntos_ala = PackedVector2Array()
	puntos_ala.append(Vector2(-30, 0))
	puntos_ala.append(Vector2(-50, -30))
	puntos_ala.append(Vector2(-10, -20))
	puntos_ala.append(Vector2(0, 0))
	ala_izq.polygon = puntos_ala
	
	var ala_der = $KimiContainer/AlaDer
	var puntos_ala_d = PackedVector2Array()
	puntos_ala_d.append(Vector2(30, 0))
	puntos_ala_d.append(Vector2(50, -30))
	puntos_ala_d.append(Vector2(10, -20))
	puntos_ala_d.append(Vector2(0, 0))
	ala_der.polygon = puntos_ala_d
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(6, 8)
	ojo1.color = Color(0.1, 0.1, 0.3, 1)
	ojo1.position = Vector2(-15, -10)
	$KimiContainer/Ojos.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(6, 8)
	ojo2.color = Color(0.1, 0.1, 0.3, 1)
	ojo2.position = Vector2(10, -10)
	$KimiContainer/Ojos.add_child(ojo2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		hud_xp.text = "XP: " + str(GameState.xp_actual)
		var vidas_str = ""
		for i in range(GameState.vidas):
			vidas_str += "❤️"
		hud_vidas.text = vidas_str
		hud_racha.text = "🔥 x" + str(GameState.racha)

func _mostrar_bienvenida_kimi() -> void:
	_mostrar_dialogo("🦅 ¡Bienvenido al Altiplano! Soy Kimi, la abejacóndor. Aquí aprenderás matemáticas y lógica andina. Resuelve los puzzles para demostrar tu sabiduría!")

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
		"leccion":
			return true
		"puzzle":
			return "leccion_andes" in progreso
		"quiz":
			return "puzzle_andes" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"leccion":
			_mostrar_lecciones()
		"puzzle":
			_mostrar_puzzles()
		"quiz":
			_mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["leccion"]
	_mostrar_dialogo("📖 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["leccion"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("📖 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("leccion_andes", modulo["xp"])

func _mostrar_puzzles() -> void:
	var modulo = MODULOS["puzzle"]
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	_mostrar_ejercicio_ui(ejercicio)

func _mostrar_ejercicio_ui(ejercicio: Dictionary) -> void:
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "Puzzle " + str(pregunta_actual + 1)
	vbox.get_node("Contenido").text = ejercicio["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(ejercicio["opciones"].size()):
		var btn = Button.new()
		btn.text = ejercicio["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta_puzzle.bind(i, ejercicio["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true
	_mostrar_dialogo("🧩 Resuelve el puzzle...")

func _on_respuesta_puzzle(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		_mostrar_dialogo("✅ ¡Correcto! Muy bien resuelto.")
		pregunta_actual += 1
		var modulo = MODULOS["puzzle"]
		if pregunta_actual < modulo["ejercicios"].size():
			await get_tree().create_timer(2.0).timeout
			_mostrar_puzzles()
		else:
			_completar_modulo("puzzle_andes", modulo["xp"])
	else:
		GameState.perder_vida()
		_actualizar_hud()
		_mostrar_dialogo("❌ No es correcto. Intenta de nuevo.")

func _mostrar_quiz() -> void:
	var modulo = MODULOS["quiz"]
	_mostrar_dialogo("⏱️ ¡Quiz de matemáticas! Piensa rápido.")
	await get_tree().create_timer(3.0).timeout
	_mostrar_pregunta_quiz()

func _mostrar_pregunta_quiz() -> void:
	var modulo = MODULOS["quiz"]
	if pregunta_actual >= modulo["preguntas"].size():
		_completar_modulo("quiz_andes", modulo["xp"])
		return
	var pregunta = modulo["preguntas"][pregunta_actual]
	_mostrar_ejercicio_ui(pregunta)

func _completar_modulo(modulo_id: String, xp: int) -> void:
	GameState.completar_modulo(modulo_id)
	GameState.agregar_xp(xp)
	_actualizar_hud()
	_mostrar_dialogo("🎉 ¡Módulo completado! Has ganado " + str(xp) + " XP.")
	contenido_a2ui.visible = false
	await get_tree().create_timer(3.0).timeout
	dialogo_overlay.visible = false

func _process(delta: float) -> void:
	var alas = $KimiContainer
	alas.scale.x = 1.0 + sin(Time.get_ticks_msec() * 0.012) * 0.08

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_tree().change_scene_to_file("res://scenes/hub/LaGranColmena.tscn")
	if event.is_action_pressed("ui_accept"):
		if dialogo_overlay.visible:
			dialogo_overlay.visible = false