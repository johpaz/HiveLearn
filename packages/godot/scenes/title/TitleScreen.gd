extends Node2D

signal escena_finalizada(tipo: String)

@onready var btn_nuevo = $CanvasLayer/BtnContainer/BtnNuevo
@onready var btn_continuar = $CanvasLayer/BtnContainer/BtnContinuar
@onready var btn_config = $CanvasLayer/BtnContainer/BtnConfig
@onready var status_label = $CanvasLayer/StatusLabel
@onready var aria_bubble = $CanvasLayer/AriaBubble

var tiempo_espera: float = 0.0
var aria_hablando: bool = false

const MENSAJE_ARIA = "¡Bienvenido! La Gran Colmena te esperaba. Presiona NUEVO JUEGO para comenzar tu aventura."

func _ready() -> void:
	print("[TitleScreen] Cargando...")
	btn_nuevo.disabled = true
	btn_continuar.disabled = true
	
	# Esperar a que NetworkManager esté listo
	await get_tree().create_timer(0.5).timeout
	
	if has_node("/root/NetworkManager"):
		NetworkManager.conectar()
		NetworkManager.connect("conectado", _on_conectado)
		NetworkManager.connect("desconectado", _on_desconectado)
		NetworkManager.connect("error_conexion", _on_error_conexion)
		NetworkManager.connect("mensaje_recibido", _on_mensaje_recibido)
	
	$ConnectionTimer.start()
	_play_animacion_intro()
	_play_animacion_colmena()
	_mostrar_burbuja_aria()

func _play_animacion_intro() -> void:
	var tween = create_tween()
	tween.set_parallel(true)
	
	# Resetear estados
	$CanvasLayer/Logo.modulate.a = 0.0
	$CanvasLayer/Logo.scale = Vector2(0.5, 0.5)
	$CanvasLayer/Titulo.modulate.a = 0.0
	$CanvasLayer/Subtitle.modulate.a = 0.0
	$ColmenaCentral.modulate.a = 0.0
	$ColmenaCentral.scale = Vector2(0.3, 0.3)
	btn_nuevo.modulate.a = 0.0
	btn_continuar.modulate.a = 0.0
	btn_config.modulate.a = 0.0
	
	# Animación de entrada
	tween.tween_property($ColmenaCentral, "modulate:a", 1.0, 1.0).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property($ColmenaCentral, "scale", Vector2(1.0, 1.0), 1.2).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property($CanvasLayer/Logo, "modulate:a", 1.0, 0.8).set_delay(0.3)
	tween.tween_property($CanvasLayer/Logo, "scale", Vector2(1.0, 1.0), 0.6).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property($CanvasLayer/Titulo, "modulate:a", 1.0, 0.5).set_delay(0.5)
	tween.tween_property($CanvasLayer/Subtitle, "modulate:a", 1.0, 0.4).set_delay(0.7)
	tween.tween_property(btn_nuevo, "modulate:a", 1.0, 0.3).set_delay(1.0)
	tween.tween_property(btn_continuar, "modulate:a", 1.0, 0.3).set_delay(1.1)
	tween.tween_property(btn_config, "modulate:a", 1.0, 0.3).set_delay(1.2)

func _play_animacion_colmena() -> void:
	# La animación de la colmena está manejada por el script ColmenaAnimada.gd
	pass

func _mostrar_burbuja_aria() -> void:
	aria_bubble.visible = true
	aria_bubble.modulate.a = 0.0
	var tween = create_tween()
	tween.tween_property(aria_bubble, "modulate:a", 1.0, 0.5)
	tween.tween_interval(4.0)
	tween.tween_property(aria_bubble, "modulate:a", 0.0, 0.5)
	tween.tween_callback(func(): aria_bubble.visible = false)

func _solicitar_voz_aria() -> void:
	if has_node("/root/NetworkManager") and NetworkManager.esta_conectado():
		NetworkManager.enviar("solicitar_tts", {
			"texto": MENSAJE_ARIA,
			"agente": "aria",
			"tipo": "bienvenida"
		})

func _on_mensaje_recibido(tipo: String, payload: Dictionary) -> void:
	match tipo:
		"tts_audio":
			if payload.has("audio"):
				var audio_data = _decodificar_audio(payload["audio"])
				if audio_data.size() > 0:
					AudioManager.reproducir_tts(audio_data)
		"voz":
			aria_hablando = false

func _decodificar_audio(audio_base64: String) -> PackedByteArray:
	var decoded = Marshalls.base64_to_raw(audio_base64)
	return decoded

func _on_conectado() -> void:
	print("[TitleScreen] Conectado al backend")
	status_label.text = "Conectado al servidor"
	status_label.modulate = Color(0.4, 1, 0.4, 1)
	btn_nuevo.disabled = false
	btn_continuar.disabled = false

func _on_desconectado(reason: String = "") -> void:
	print("[TitleScreen] Desconectado")
	status_label.text = "Modo offline - sin servidor"
	status_label.modulate = Color(1, 0.6, 0.3, 1)
	btn_nuevo.disabled = false

func _on_error_conexion(mensaje: String) -> void:
	print("[TitleScreen] Error: ", mensaje)
	status_label.text = "Error de conexión"
	status_label.modulate = Color(1, 0.3, 0.3, 1)
	btn_nuevo.disabled = false

func _on_connection_timer_timeout() -> void:
	tiempo_espera += 0.5
	if tiempo_espera > 3.0 and btn_nuevo.disabled:
		btn_nuevo.disabled = false
		btn_continuar.disabled = false

func _on_btn_nuevo_pressed() -> void:
	print("[TitleScreen] Nuevo juego")
	AudioManager.reproducir_sfx("res://assets/audio/click.wav")
	_transicion_a_onboarding()

func _transicion_a_onboarding() -> void:
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property($CanvasLayer, "modulate:a", 0.0, 0.4)
	tween.tween_property($ColmenaCentral, "modulate:a", 0.0, 0.4)
	tween.tween_property($Particles, "modulate:a", 0.0, 0.4)
	tween.tween_callback(func():
		emit_signal("escena_finalizada", "onboarding")
	)

func _on_btn_continuar_pressed() -> void:
	if has_node("/root/GameState") and GameState.alumno_id != "":
		print("[TitleScreen] Continuar - ID: ", GameState.alumno_id)
		_transicion_a_hub()
	else:
		btn_continuar.text = "Sin progreso guardado"
		btn_continuar.disabled = true

func _transicion_a_hub() -> void:
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property($CanvasLayer, "modulate:a", 0.0, 0.4)
	tween.tween_property($ColmenaCentral, "modulate:a", 0.0, 0.4)
	tween.tween_property($Particles, "modulate:a", 0.0, 0.4)
	tween.tween_callback(func():
		emit_signal("escena_finalizada", "hub")
	)

func _on_btn_config_pressed() -> void:
	print("[TitleScreen] Configuración")
	_mostrar_menu_config()

func _mostrar_menu_config() -> void:
	var panel = PanelContainer.new()
	panel.name = "ConfigPanel"
	panel.anchors_preset = Control.PRESET_CENTER
	panel.offset_left = -200
	panel.offset_top = -150
	panel.offset_right = 200
	panel.offset_bottom = 150
	
	var vbox = VBoxContainer.new()
	var label = Label.new()
	label.text = "CONFIGURACIÓN"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	
	var btn_mute = Button.new()
	btn_mute.text = "Silenciar voz de Aria"
	btn_mute.pressed.connect(func(): AudioManager.detener())
	
	var btn_volver = Button.new()
	btn_volver.text = "← Volver"
	btn_volver.pressed.connect(func(): panel.queue_free())
	
	vbox.add_child(label)
	vbox.add_child(btn_mute)
	vbox.add_child(btn_volver)
	panel.add_child(vbox)
	add_child(panel)

func _exit_tree() -> void:
	$ConnectionTimer.stop()