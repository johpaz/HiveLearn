extends Node2D

const RADIO_HEX = 90.0

const ZONAS = {
	1: {"nombre": "Selva Amazónica", "agente": "Yara", "descripcion": "La naturaleza te espera. Aprende sobre ciencias y el medio ambiente.", "color": Color(0.2, 0.6, 0.3), "icono": "🌿", "escena": "res://scenes/worlds/SelvaAmazonica.tscn"},
	2: {"nombre": "Altiplano Andino", "agente": "Kimi", "descripcion": "Desafíos de lógica y matemáticas en las montañas.", "color": Color(0.5, 0.5, 0.6), "icono": "🏔️", "escena": "res://scenes/worlds/AltiplanoAndino.tscn"},
	3: {"nombre": "Cenotes Mayas", "agente": "Ix", "descripcion": "Descubre la historia y cultura de los mayas.", "color": Color(0.2, 0.5, 0.7), "icono": "🌊", "escena": "res://scenes/worlds/CenotesMayas.tscn"},
	4: {"nombre": "Machu Picchu", "agente": "Killa", "descripcion": "Explora el imperio inca y su ingeniería.", "color": Color(0.6, 0.5, 0.3), "icono": "🦙", "escena": "res://scenes/worlds/LimaInca.tscn"},
	5: {"nombre": "Sierra de Bogotá", "agente": "Tota", "descripcion": "Astronomía y medicina muisca.", "color": Color(0.4, 0.3, 0.2), "icono": "🐆", "escena": "res://scenes/worlds/BogotaChibcha.tscn"},
	6: {"nombre": "Tiwanaku", "agente": "Kallu", "descripcion": "Cosmovisión aymara y filosofía.", "color": Color(0.35, 0.45, 0.55), "icono": "🦙", "escena": "res://scenes/worlds/Tiwanaku.tscn"},
	7: {"nombre": "Orinoco", "agente": "Maki", "descripcion": "Biodiversidad y geografía de Venezuela.", "color": Color(0.4, 0.6, 0.7), "icono": "🐬", "escena": "res://scenes/worlds/AmazoniaOrinoco.tscn"},
	8: {"nombre": "Quito Andino", "agente": "Inti", "descripcion": "Volcanes, Galápagos y ecología.", "color": Color(0.2, 0.5, 0.6), "icono": "🐦", "escena": "res://scenes/worlds/QuitoAndes.tscn"},
	9: {"nombre": "Amazonía Brasil", "agente": "Jacaré", "descripcion": "Fauna y mitología del Amazonas.", "color": Color(0.15, 0.4, 0.25), "icono": "🦜", "escena": "res://scenes/worlds/RioAmazonas.tscn"},
	10: {"nombre": "Costa Chilena", "agente": "Nico", "descripcion": "Oceanografía y deportes.", "color": Color(0.15, 0.35, 0.55), "icono": "🐧", "escena": "res://scenes/worlds/SantiagoChile.tscn"},
	11: {"nombre": "Tikal", "agente": "Chaac", "descripcion": "Arquitectura y astronomía maya.", "color": Color(0.2, 0.4, 0.25), "icono": "🐒", "escena": "res://scenes/worlds/TikalGuatemala.tscn"},
	12: {"nombre": "Galaxia Digital", "agente": "Byte", "descripcion": "Aprende a programar y crear tecnología.", "color": Color(0.3, 0.3, 0.6), "icono": "🤖", "escena": "res://scenes/worlds/GalaxiaDigital.tscn"}
}

var zona_seleccionada: int = 0

@onready var colmena_container = $ColmenaContainer
@onready var hud_nickname = $HUD/TopBar/HBox/Nickname
@onready var hud_xp = $HUD/TopBar/HBox/XP
@onready var hud_nivel = $HUD/TopBar/HBox/Nivel
@onready var hud_vidas = $HUD/TopBar/RightBar/Vidas
@onready var player = $ColmenaContainer/Player

func _ready() -> void:
	_dibujar_player()
	_actualizar_hud()
	_actualizar_zonas()
	_mostrar_bienvenida_aria()
	
	if has_node("/root/GameState"):
		GameState.connect("zona_desbloqueada", _on_zona_desbloqueada)
		GameState.connect("progreso_actualizado", _on_progreso_actualizado)
	
	if has_node("HUD/TopBar/VoiceButton"):
		$HUD/TopBar/VoiceButton.pressed.connect(_on_voice_button_pressed)
	
	if has_node("/root/VoiceInput"):
		VoiceInput.connect("voz_recibida", _on_voz_recibida)
	
	_play_animacion_entrada()

func _on_voice_button_pressed() -> void:
	if has_node("/root/VoiceInput"):
		if VoiceInput.recognition_active:
			VoiceInput.detener_escucha()
		else:
			VoiceInput.iniciar_escucha()

func _on_voz_recibida(texto: String) -> void:
	var numero = VoiceInput.obtener_opcion_numerica(texto)
	if numero >= 1 and numero <= 12:
		if _verificar_acceso_zona(numero):
			zona_seleccionada = numero
			_actualizar_info_zona(numero)
			$ZonaInfo.visible = true
		else:
			_mostrar_dialogo_aria("🔒 Zona bloqueada. Completa las zonas anteriores primero.")
	else:
		var comando = VoiceInput.obtener_comando_accion(texto)
		match comando["accion"]:
			"menu", "salir":
				_mostrar_dialogo_aria("🏠 Volviendo al menú principal...")
			"ayuda":
				_mostrar_dialogo_aria("🎤 Di un número del 1 al 12 para seleccionar una zona. Ej: 'uno', 'cinco'.")

func _draw() -> void:
	# Dibuja estrellas de fondo
	for i in range(50):
		var pos = Vector2(randf() * 1280, randf() * 720)
		var tamaño = randf() * 2 + 1
		draw_circle(pos, tamaño, Color(1, 1, 1, randf() * 0.5 + 0.2))

func _dibujar_player() -> void:
	var cuerpo = $ColmenaContainer/Player/Cuerpo
	var alas = $ColmenaContainer/Player/Alas
	var ojos = $ColmenaContainer/Player/Ojos
	
	# Cuerpo de abeja
	var puntos_cuerpo = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos_cuerpo.append(Vector2(cos(angulo) * 15, sin(angulo) * 20))
	cuerpo.polygon = puntos_cuerpo
	
	# Alas
	var puntos_alas = PackedVector2Array()
	puntos_alas.append(Vector2(-20, 0))
	puntos_alas.append(Vector2(-10, -25))
	puntos_alas.append(Vector2(10, -25))
	puntos_alas.append(Vector2(20, 0))
	puntos_alas.append(Vector2(10, 10))
	puntos_alas.append(Vector2(-10, 10))
	alas.polygon = puntos_alas
	
	# Ojos
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(4, 6)
	ojo1.color = Color(0.1, 0.1, 0.1, 1)
	ojo1.position = Vector2(-8, -5)
	ojos.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(4, 6)
	ojo2.color = Color(0.1, 0.1, 0.1, 1)
	ojo2.position = Vector2(4, -5)
	ojos.add_child(ojo2)

func _play_animacion_entrada() -> void:
	colmena_container.scale = Vector2(0.3, 0.3)
	colmena_container.modulate.a = 0.0
	
	var tween = create_tween().set_parallel(true)
	tween.tween_property(colmena_container, "modulate:a", 1.0, 0.8).set_ease(Tween.EASE_OUT)
	tween.tween_property(colmena_container, "scale", Vector2(1.0, 1.0), 1.0).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		hud_nickname.text = GameState.nickname
		hud_xp.text = "XP: " + str(GameState.xp_actual)
		hud_nivel.text = "Nivel " + str(GameState.nivel_actual) + ": " + GameState.obtener_nivel_actual()["nombre"]
		
		var vidas_str = ""
		for i in range(GameState.vidas):
			vidas_str += "❤️"
		for i in range(3 - GameState.vidas):
			vidas_str += "🖤"
		hud_vidas.text = vidas_str

func _actualizar_zonas() -> void:
	if has_node("/root/GameState") and colmena_container.has_method("actualizar_zonas"):
		colmena_container.actualizar_zonas(GameState.zonas_desbloqueadas)

func _mostrar_bienvenida_aria() -> void:
	$AriaOverlay.visible = true
	$AriaOverlay.modulate.a = 0.0
	
	var tween = create_tween()
	tween.tween_property($AriaOverlay, "modulate:a", 1.0, 0.5)
	tween.tween_interval(5.0)
	tween.tween_property($AriaOverlay, "modulate:a", 0.0, 0.5)
	var aria_overlay = $AriaOverlay
	tween.tween_callback(func(): aria_overlay.visible = false)

func _on_zona_pressed(zona_id: int) -> void:
	zona_seleccionada = zona_id
	_mostrar_info_zona(zona_id)

func _mostrar_info_zona(zona_id: int) -> void:
	if not ZONAS.has(zona_id):
		return
	
	var zona = ZONAS[zona_id]
	var info = $ZonaInfo
	info.visible = true
	info.modulate.a = 0.0
	
	$ZonaInfo/VBox/TituloZona.text = zona["icono"] + " " + zona["nombre"]
	$ZonaInfo/VBox/AgenteZona.text = "Agente: " + zona["agente"]
	$ZonaInfo/VBox/Descripcion.text = zona["descripcion"]
	
	if zona_id in GameState.zonas_desbloqueadas:
		$ZonaInfo/VBox/EntrarBtn.disabled = false
		$ZonaInfo/VBox/EntrarBtn.text = "ENTRAR"
	else:
		$ZonaInfo/VBox/EntrarBtn.disabled = true
		$ZonaInfo/VBox/EntrarBtn.text = "BLOQUEADO"
	
	var tween = create_tween()
	tween.tween_property(info, "modulate:a", 1.0, 0.3)

func _on_entrar_pressed() -> void:
	if zona_seleccionada > 0:
		print("[Hub] Entrando a zona ", zona_seleccionada)
		_solicitar_voz_zona(zona_seleccionada)
		await get_tree().create_timer(2.0).timeout
		_navegar_a_mini_mundo(zona_seleccionada)

func _on_cerrar_pressed() -> void:
	var tween = create_tween()
	var zona_info = $ZonaInfo
	tween.tween_property(zona_info, "modulate:a", 0.0, 0.2)
	tween.tween_callback(_cerrar_info_zona)

func _solicitar_voz_zona(zona_id: int) -> void:
	if has_node("/root/NetworkManager") and NetworkManager.esta_conectado():
		var zona = ZONAS[zona_id]
		NetworkManager.enviar("solicitar_tts", {
			"texto": "Viajando a " + zona["nombre"] + ". " + zona["descripcion"],
			"agente": zona["agente"],
			"tipo": "entrada_zona"
		})

func _on_zona_desbloqueada(zona_id: int) -> void:
	if colmena_container.has_method("animacion_desbloqueo"):
		colmena_container.animacion_desbloqueo(zona_id)
	_mostrar_mensaje_desbloqueo(zona_id)

func _mostrar_mensaje_desbloqueo(zona_id: int) -> void:
	var zona = ZONAS[zona_id]
	$AriaOverlay/Label.text = "¡Felicitaciones! Has desbloqueado: " + zona["nombre"]
	$AriaOverlay.visible = true
	
	var aria_overlay = $AriaOverlay
	var tween = create_tween()
	tween.tween_property(aria_overlay, "modulate:a", 1.0, 0.3)
	tween.tween_interval(3.0)
	tween.tween_property(aria_overlay, "modulate:a", 0.0, 0.3)
	tween.tween_callback(func(): aria_overlay.visible = false)

func _on_progreso_actualizado() -> void:
	_actualizar_hud()

func _process(delta: float) -> void:
	# Animación del player
	var alas = $ColmenaContainer/Player/Alas
	alas.scale.x = 1.0 + sin(Time.get_ticks_msec() * 0.015) * 0.15
	
	# Controles de teclado para mover el player
	if Input.is_action_pressed("ui_up"):
		player.position.y -= 200 * delta
	elif Input.is_action_pressed("ui_down"):
		player.position.y += 200 * delta
	if Input.is_action_pressed("ui_left"):
		player.position.x -= 200 * delta
	elif Input.is_action_pressed("ui_right"):
		player.position.x += 200 * delta
	
	# Mantener player dentro de la colmena
	var distancia = player.position.length()
	if distancia > RADIO_HEX * 1.2:
		player.position = player.position.normalized() * RADIO_HEX * 1.2

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_mostrar_menu_pausa()
	if event.is_action_pressed("ui_accept"):
		if zona_seleccionada > 0:
			_on_entrar_pressed()

func _mostrar_menu_pausa() -> void:
	var panel = PanelContainer.new()
	panel.anchors_preset = Control.PRESET_CENTER
	panel.offset_left = -200
	panel.offset_top = -150
	panel.offset_right = 200
	panel.offset_bottom = 150
	
	var vbox = VBoxContainer.new()
	var label = Label.new()
	label.text = "PAUSA"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	
	var btn_salir = Button.new()
	btn_salir.text = "Salir al Título"
	btn_salir.pressed.connect(func():
		panel.queue_free()
		get_tree().change_scene_to_file("res://scenes/title/TitleScreen.tscn")
	)
	
	var btn_continuar = Button.new()
	btn_continuar.text = "Continuar"
	btn_continuar.pressed.connect(func(): panel.queue_free())
	
	vbox.add_child(label)
	vbox.add_child(btn_continuar)
	vbox.add_child(btn_salir)
	panel.add_child(vbox)
	add_child(panel)

func _cerrar_info_zona() -> void:
	$ZonaInfo.visible = false
	zona_seleccionada = 0

func _navegar_a_mini_mundo(zona_id: int) -> void:
	GameState.estado_actual = GameState.EstadoJuego.MINI_MUNDO
	GameState.programa_tema = ZONAS[zona_id]["nombre"]
	
	var escena = ""
	match zona_id:
		1: escena = ZONAS[1]["escena"]
		2: escena = ZONAS[2]["escena"]
		3: escena = ZONAS[3]["escena"]
		4: escena = ZONAS[4]["escena"]
		5: escena = ZONAS[5]["escena"]
		6: escena = ZONAS[6]["escena"]
		7: escena = ZONAS[7]["escena"]
		8: escena = ZONAS[8]["escena"]
		9: escena = ZONAS[9]["escena"]
		10: escena = ZONAS[10]["escena"]
		11: escena = ZONAS[11]["escena"]
		12: escena = ZONAS[12]["escena"]
	
	if escena != "":
		get_tree().change_scene_to_file(escena)

func _mostrar_dialogo_aria(texto: String) -> void:
	$AriaOverlay.visible = true
	$AriaOverlay.modulate.a = 0.0
	$AriaOverlay/Label.text = texto
	
	var tween = create_tween()
	tween.tween_property($AriaOverlay, "modulate:a", 1.0, 0.3)
	tween.tween_interval(4.0)
	tween.tween_property($AriaOverlay, "modulate:a", 0.0, 0.3)
	var aria_overlay = $AriaOverlay
	tween.tween_callback(func(): aria_overlay.visible = false)

func _verificar_acceso_zona(zona_id: int) -> bool:
	if zona_id == 1:
		return true
	var zonas_desbloqueadas = GameState.zonas_desbloqueadas if has_node("/root/GameState") else [1]
	return zona_id in zonas_desbloqueadas

func _actualizar_info_zona(zona_id: int) -> void:
	_mostrar_info_zona(zona_id)