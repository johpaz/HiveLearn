extends Node2D

signal escena_finalizada(tipo: String)

enum PasoOnboarding {
	EDAD,
	NOMBRE,
	AVATAR
}

var paso_actual: PasoOnboarding = PasoOnboarding.EDAD
var nickname_escogido: String = ""
var avatar_escogido: String = "abeja_amarilla"
var edad_seleccionada: String = ""

const MENSAJES_ARIA = {
	"edad": "¡Bienvenido! La Gran Colmena te esperaba.\n\n¿CUÁNTOS AÑOS TIENES?",
	"nombre": "¡Qué emocionante! Nos alegra tener un nuevo aprendiz.\n\n¿CÓMO QUIERES QUE TE LLAME?",
	"avatar": "¡Perfecto, %s!\n\nAhora, elige tu avatar de abeja para el viaje."
}

const OPCIONES_EDAD = [
	{"id": "nino", "texto": "NIÑO/A", "icono": "🐣", "rango": "6-12"},
	{"id": "joven", "texto": "JOVEN", "icono": "🌱", "rango": "13-17"},
	{"id": "adulto", "texto": "ADULTO/A", "icono": "🌳", "rango": "18+"}
]

const AVATARES = [
	{"id": "abeja_amarilla", "nombre": "Amarilla", "color": Color(1, 0.9, 0.2)},
	{"id": "abeja_naranja", "nombre": "Naranja", "color": Color(1, 0.5, 0.1)},
	{"id": "abeja_roja", "nombre": "Roja", "color": Color(1, 0.2, 0.2)},
	{"id": "abeja_morado", "nombre": "Morada", "color": Color(0.6, 0.3, 0.9)},
	{"id": "abeja_verde", "nombre": "Verde", "color": Color(0.2, 0.8, 0.4)},
	{"id": "abeja_cyborg", "nombre": "Cyborg", "color": Color(0.4, 0.8, 0.9)}
]

@onready var dialogo_label = $DialogoPanel/DialogoLabel
@onready var content_container = $ContentContainer
@onready var progress_dots = $ProgressDots

func _ready() -> void:
	_dibujar_aria()
	_actualizar_ui()
	_play_animacion_entrada()

func _dibujar_aria() -> void:
	# Dibujar hexágono para Aria
	var cuerpo = $AriaContainer/AriaBody
	var alas = $AriaContainer/AriaAlas
	var corona = $AriaContainer/AriaCorona
	
	var puntos_cuerpo = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos_cuerpo.append(Vector2(cos(angulo) * 50, sin(angulo) * 60))
	cuerpo.polygon = puntos_cuerpo
	
	var puntos_corona = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos_corona.append(Vector2(cos(angulo) * 30, sin(angulo) * 30) + Vector2(0, -10))
	corona.polygon = puntos_corona
	
	var puntos_alas = PackedVector2Array()
	puntos_alas.append(Vector2(-60, 0))
	puntos_alas.append(Vector2(-30, -40))
	puntos_alas.append(Vector2(0, -20))
	puntos_alas.append(Vector2(30, -40))
	puntos_alas.append(Vector2(60, 0))
	puntos_alas.append(Vector2(30, 20))
	puntos_alas.append(Vector2(0, 10))
	puntos_alas.append(Vector2(-30, 20))
	alas.polygon = puntos_alas

func _play_animacion_entrada() -> void:
	$AriaContainer.position.x = -100
	$DialogoPanel.position.x = -100
	$ContentContainer.position.x = 1300
	
	var tween = create_tween().set_parallel(true)
	tween.tween_property($AriaContainer, "position:x", 150, 0.8).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property($DialogoPanel, "position:x", 0, 0.6).set_delay(0.3).set_ease(Tween.EASE_OUT)
	tween.tween_property($ContentContainer, "position:x", 600, 0.5).set_delay(0.5).set_ease(Tween.EASE_OUT)

func _actualizar_ui() -> void:
	_actualizar_progress()
	_actualizar_titulo()
	
	match paso_actual:
		PasoOnboarding.EDAD:
			dialogo_label.text = MENSAJES_ARIA["edad"]
			_mostrar_opciones_edad()
		PasoOnboarding.NOMBRE:
			dialogo_label.text = MENSAJES_ARIA["nombre"]
			_mostrar_input_nombre()
		PasoOnboarding.AVATAR:
			dialogo_label.text = MENSAJES_ARIA["nombre"] % nickname_escogido
			_mostrar_avatares()

func _actualizar_progress() -> void:
	var colors = [Color(1, 0.85, 0.2, 1), Color(0.3, 0.3, 0.3, 1)]
	$ProgressDots/Dot1.color = colors[0] if paso_actual == PasoOnboarding.EDAD else colors[1]
	$ProgressDots/Dot2.color = colors[0] if paso_actual == PasoOnboarding.NOMBRE else colors[1]
	$ProgressDots/Dot3.color = colors[0] if paso_actual == PasoOnboarding.AVATAR else colors[1]

func _actualizar_titulo() -> void:
	var titulos = {
		PasoOnboarding.EDAD: "¿Quién eres?",
		PasoOnboarding.NOMBRE: "¿Cómo te llamas?",
		PasoOnboarding.AVATAR: "Elige tu avatar"
	}
	$Titulo.text = titulos[paso_actual]

func _mostrar_opciones_edad() -> void:
	_limpiar_content()
	
	for i in range(OPCIONES_EDAD.size()):
		var opcion = OPCIONES_EDAD[i]
		var btn = Button.new()
		btn.text = opcion["icono"] + " " + opcion["texto"] + " (" + opcion["rango"] + ")"
		btn.custom_minimum_size = Vector2(300, 60)
		btn.anchors_preset = Control.PRESET_CENTER
		btn.offset_top = i * 80 - 80
		btn.offset_bottom = i * 80 - 20
		btn.offset_left = -150
		btn.offset_right = 150
		btn.pressed.connect(_on_edad_seleccionada.bind(opcion["id"]))
		content_container.add_child(btn)

func _mostrar_input_nombre() -> void:
	_limpiar_content()
	
	var input = LineEdit.new()
	input.placeholder_text = "Tu nombre..."
	input.custom_minimum_size = Vector2(300, 50)
	input.anchors_preset = Control.PRESET_CENTER
	input.offset_left = -150
	input.offset_right = 150
	input.offset_top = -25
	input.offset_bottom = 25
	input.text_submitted.connect(_on_nombre_enviado)
	input.focus_entered.connect(func(): _solicitar_voz("¿Cómo te llamas?"))
	content_container.add_child(input)
	
	await get_tree().create_timer(0.5).timeout
	input.grab_focus()

func _mostrar_avatares() -> void:
	_limpiar_content()
	
	var grid = GridContainer.new()
	grid.columns = 3
	grid.custom_minimum_size = Vector2(350, 200)
	grid.anchors_preset = Control.PRESET_CENTER
	grid.offset_left = -175
	grid.offset_right = 175
	grid.offset_top = -100
	grid.offset_bottom = 100
	
	for av in AVATARES:
		var btn = Button.new()
		btn.custom_minimum_size = Vector2(100, 70)
		btn.text = av["nombre"]
		btn.pressed.connect(_on_avatar_seleccionado.bind(av["id"]))
		grid.add_child(btn)
	
	content_container.add_child(grid)

func _limpiar_content() -> void:
	for child in content_container.get_children():
		child.queue_free()

func _on_edad_seleccionada(edad: String) -> void:
	edad_seleccionada = edad
	GameState.edad_rango = edad
	GameState.estilo_aprendizaje = "visual" if edad == "nino" else "auditivo" if edad == "adulto" else "mixto"
	_play_seleccion_anim()
	_siguiente_paso()

func _on_nombre_enviado(nombre: String) -> void:
	if nombre.length() >= 2:
		nickname_escogido = nombre.strip_edges()
		_play_seleccion_anim()
		_siguiente_paso()
	else:
		dialogo_label.text = "El nombre debe tener al menos 2 letras"
		dialogo_label.modulate = Color(1, 0.5, 0.5, 1)

func _on_avatar_seleccionado(avatar_id: String) -> void:
	avatar_escogido = avatar_id
	_play_seleccion_anim()
	_registrar_jugador()

func _siguiente_paso() -> void:
	match paso_actual:
		PasoOnboarding.EDAD:
			paso_actual = PasoOnboarding.NOMBRE
		PasoOnboarding.NOMBRE:
			paso_actual = PasoOnboarding.AVATAR
	
	_actualizar_ui()
	_play_transicion_contenido()

func _play_seleccion_anim() -> void:
	var tween = create_tween()
	tween.tween_property(content_container, "modulate:a", 0.0, 0.2)
	tween.tween_property(content_container, "position:x", 650, 0.1)
	tween.tween_property(content_container, "position:x", 600, 0.3).set_ease(Tween.EASE_OUT)
	tween.tween_property(content_container, "modulate:a", 1.0, 0.2).set_delay(0.2)

func _play_transicion_contenido() -> void:
	content_container.position.x = 800
	var tween = create_tween()
	tween.tween_property(content_container, "position:x", 600, 0.4).set_ease(Tween.EASE_OUT)

func _solicitar_voz(texto: String) -> void:
	if has_node("/root/NetworkManager") and NetworkManager.esta_conectado():
		NetworkManager.enviar("solicitar_tts", {
			"texto": texto,
			"agente": "aria",
			"tipo": "pregunta"
		})

func _registrar_jugador() -> void:
	_solicitar_voz("¡Bienvenido, " + nickname_escogido + "! Vamos a explorar la Gran Colmena.")
	
	if has_node("/root/NetworkManager") and NetworkManager.esta_conectado():
		NetworkManager.enviar("registro_alumno", {
			"nickname": nickname_escogido,
			"avatar": avatar_escogido,
			"edad_rango": edad_seleccionada,
			"estilo": GameState.estilo_aprendizaje
		})
		NetworkManager.connect("mensaje_recibido", _on_respuesta_registro)
		await get_tree().create_timer(2.0).timeout
	
	_continuar_sin_registro()

func _on_respuesta_registro(tipo: String, payload: Dictionary) -> void:
	if tipo == "alumno_registrado":
		GameState.set_jugador(
			payload.get("id", "local"),
			nickname_escogido,
			avatar_escogido,
			edad_seleccionada,
			GameState.estilo_aprendizaje
		)
		_transicionar_a_hub()
	else:
		_continuar_sin_registro()

func _continuar_sin_registro() -> void:
	GameState.set_jugador("local", nickname_escogido, avatar_escogido, edad_seleccionada, GameState.estilo_aprendizaje)
	_transicionar_a_hub()

func _transicionar_a_hub() -> void:
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property($AriaContainer, "position:x", -200, 0.5)
	tween.tween_property($DialogoPanel, "modulate:a", 0.0, 0.4)
	tween.tween_property($ContentContainer, "modulate:a", 0.0, 0.4)
	tween.tween_property($Titulo, "modulate:a", 0.0, 0.3)
	tween.tween_property($ProgressDots, "modulate:a", 0.0, 0.3)
	tween.tween_callback(emit_signal.bind("escena_finalizada", "hub"))

func _process(delta: float) -> void:
	# Animación de alas de Aria
	var alas = $AriaContainer/AriaAlas
	alas.scale.x = 1.0 + sin(Time.get_ticks_msec() * 0.01) * 0.1
