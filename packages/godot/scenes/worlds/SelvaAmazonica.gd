extends Node2D

enum TipoZona {
	FOGATA,    # Lección de concepto
	CUEVA,     # Ejercicio práctico
	RIO,       # Quiz cronometrado
	ARBOL      # Boss final
}

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"fogata": {
		"titulo": "La Selva y sus Habitantes",
		"lecciones": [
			{"titulo": "Plantas de la Selva", "contenido": "La selva amazónica tiene más de 40,000 especies de plantas. Los árboles pueden superar los 60 metros de altura."},
			{"titulo": "Animales de la Selva", "contenido": "Aquí viven jaguares, monos, loros, anacondas y miles de insectos. Es el lugar con más biodiversidad del planeta."},
			{"titulo": "El Clima", "contenido": "La selva tiene clima tropical con mucha lluvia. La temperatura siempre es cálida, entre 20 y 30 grados."},
			{"titulo": "Agua y Ríos", "contenido": "El río Amazonas es el más grande del mundo. Trae agua dulce a millones de personas y animales."},
			{"titulo": "Protección de la Selva", "contenido": "La selva necesita protection. Cuando cortamos árboles, los animales pierden su hogar. devemos cuidarla."}
		],
		"xp": 50
	},
	"cueva": {
		"titulo": "Ejercicios de Ciencias",
		"ejercicios": [
			{"pregunta": "¿Cómo se llama el árbol más alto de la selva?", "opciones": ["Ceiba", "Palma", "Mangle", "Eucalipto"], "respuesta": 0},
			{"pregunta": "¿Qué animal es el rey de la selva?", "opciones": ["León", "Jaguar", "Elefante", "Mono"], "respuesta": 1},
			{"pregunta": "¿Cuántas especies de plantas hay en la selva?", "opciones": ["10,000", "20,000", "40,000", "100,000"], "respuesta": 2},
			{"pregunta": "¿Cuál es el río más grande del mundo?", "opciones": ["Nilo", "Amazonas", "Misisipi", "Yangtsé"], "respuesta": 1},
			{"pregunta": "¿Qué árbol tiene flores rojas y frutas grandes?", "opciones": ["Palma", "Ceiba", "Mangle", "Eucalyptus"], "respuesta": 1}
		],
		"xp": 75
	},
	"rio": {
		"titulo": "Quiz de la Selva",
		"preguntas": [
			{"pregunta": "¿Qué río es el más grande de la selva?", "opciones": ["Orinoco", "Amazonas", "Marañón", "Negro"], "respuesta": 1},
			{"pregunta": "Los árboles que pierden hojas se llaman:", "opciones": ["Perennes", "Caducifolios", "Tropicales", "Herbáceos"], "respuesta": 1},
			{"pregunta": "¿Qué animal vive en el agua y tiene escamas?", "opciones": ["Mono", "Jaguar", "Pez", "Loro"], "respuesta": 2},
			{"pregunta": "La mitad de la selva está en...", "opciones": ["Brasil", "Colombia", "Perú", "Venezuela"], "respuesta": 0}
		],
		"xp": 100,
		"tiempo": 30
	},
	"arbol": {
		"titulo": "Desafío Final",
		"prueba": "Demuestra todo lo que has aprendido para convertirte en Guardián de la Selva",
		"xp": 200
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI
@onready var hud_xp = $HUD/TopBar/HBox/XP
@onready var hud_vidas = $HUD/TopBar/HBox/VidasLabel
@onready var hud_racha = $HUD/TopBar/HBox/RachaLabel
@onready var yara_container = $YaraContainer

func _ready() -> void:
	_dibujar_yara()
	_actualizar_hud()
	_mostrar_bienvenida_yara()
	_dibujar_fondo()
	
	if has_node("HUD/TopBar/VoiceButton"):
		$HUD/TopBar/VoiceButton.pressed.connect(_on_voice_button_pressed)
	
	if has_node("/root/VoiceInput"):
		VoiceInput.connect("voz_recibida", _on_voz_recibida)

func _on_voice_button_pressed() -> void:
	if has_node("/root/VoiceInput"):
		if VoiceInput.recognition_active:
			VoiceInput.detener_escucha()
		else:
			VoiceInput.iniciar_escucha()

func _on_voz_recibida(texto: String) -> void:
	if contenido_a2ui.visible and modulo_actual != "":
		var modulo = MODULOS[modulo_actual]
		var numero = VoiceInput.obtener_opcion_numerica(texto)
		if numero > 0 and numero <= 4:
			if modulo_actual == "cueva":
				var respuesta_correcta = modulo["ejercicios"][pregunta_actual]["respuesta"]
				_on_respuesta_ejercicio(numero - 1, respuesta_correcta)
			elif modulo_actual == "rio":
				var respuesta_correcta = modulo["preguntas"][pregunta_actual]["respuesta"]
				_on_respuesta_quiz(numero - 1, respuesta_correcta)
	_mostrar_dialogo("🎤 Recibido: " + texto)

func _dibujar_fondo() -> void:
	var bg = $Fondo
	for i in range(30):
		var tree = Polygon2D.new()
		var height = randf_range(60, 120)
		var width = randf_range(30, 50)
		var puntos = PackedVector2Array()
		puntos.append(Vector2(0, height))
		puntos.append(Vector2(width * 0.3, 0))
		puntos.append(Vector2(width * 0.5, height * 0.3))
		puntos.append(Vector2(width * 0.7, 0))
		puntos.append(Vector2(width, height))
		tree.polygon = puntos
		tree.color = Color(0.1 + randf() * 0.1, 0.3 + randf() * 0.2, 0.1, 1)
		tree.position = Vector2(randf() * 1280, randf() * 720)
		bg.add_child(tree)

func _dibujar_yara() -> void:
	var cuerpo = $YaraContainer/Cuerpo
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos.append(Vector2(cos(angulo) * 40, sin(angulo) * 50))
	cuerpo.polygon = puntos
	
	var ojo1 = ColorRect.new()
	ojo1.custom_minimum_size = Vector2(6, 8)
	ojo1.color = Color(0.1, 0.1, 0.1, 1)
	ojo1.position = Vector2(-15, -10)
	$YaraContainer/Ojos.add_child(ojo1)
	
	var ojo2 = ColorRect.new()
	ojo2.custom_minimum_size = Vector2(6, 8)
	ojo2.color = Color(0.1, 0.1, 0.1, 1)
	ojo2.position = Vector2(10, -10)
	$YaraContainer/Ojos.add_child(ojo2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		hud_xp.text = "XP: " + str(GameState.xp_actual)
		
		var vidas_str = ""
		for i in range(GameState.vidas):
			vidas_str += "❤️"
		hud_vidas.text = vidas_str
		
		hud_racha.text = "🔥 x" + str(GameState.racha)

func _mostrar_bienvenida_yara() -> void:
	_mostrar_dialogo("🐝 ¡Bienvenido a la Selva Amazónica! Soy Yara, tu guía en este mundo verde. Explora las zonas de aprendizaje y conviertete en Guardián de la Selva!")

func _mostrar_dialogo(texto: String) -> void:
	$DialogoOverlay/Label.text = texto
	dialogo_overlay.visible = true
	dialogo_overlay.modulate.a = 0.0
	
	var tween = create_tween()
	tween.tween_property(dialogo_overlay, "modulate:a", 1.0, 0.3)

func _on_zona_pressed(tipo_zona: String) -> void:
	zona_actual = tipo_zona
	
	if not _verificar_acceso(tipo_zona):
		_mostrar_dialogo("🔒 ¡Primero completa las zonas anteriores para desbloquear esta!")
		return
	
	_iniciar_zona(tipo_zona)

func _verificar_acceso(tipo_zona: String) -> bool:
	var progreso = GameState.modulos_completados
	
	match tipo_zona:
		"fogata":
			return true
		"cueva":
			return "fogata_selva" in progreso
		"rio":
			return "cueva_selva" in progreso
		"arbol":
			return "rio_selva" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	
	modulo_actual = tipo_zona
	pregunta_actual = 0
	
	match tipo_zona:
		"fogata":
			_mostrar_lecciones()
		"cueva":
			_mostrar_ejercicios()
		"rio":
			_mostrar_quiz()
		"arbol":
			_mostrar_boss()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["fogata"]
	_mostrar_dialogo("📖 " + modulo["titulo"] + ". " + modulo["lecciones"][0]["contenido"])
	
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["fogata"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("📖 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("fogata_selva", modulo["xp"])

func _mostrar_ejercicios() -> void:
	var modulo = MODULOS["cueva"]
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	_mostrar_ejercicio_ui(ejercicio)

func _mostrar_ejercicio_ui(ejercicio: Dictionary) -> void:
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "Ejercicio " + str(pregunta_actual + 1)
	vbox.get_node("Contenido").text = ejercicio["pregunta"]
	
	for child in vbox.get_node("Opciones").get_children():
		child.queue_free()
	
	for i in range(ejercicio["opciones"].size()):
		var btn = Button.new()
		btn.text = ejercicio["opciones"][i]
		btn.custom_minimum_size = Vector2(280, 40)
		btn.pressed.connect(_on_respuesta_ejercicio.bind(i, ejercicio["respuesta"]))
		vbox.get_node("Opciones").add_child(btn)
	
	contenido_a2ui.visible = true
	_mostrar_dialogo("🤔 Responde la pregunta para continuar...")

func _on_respuesta_ejercicio(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		_mostrar_dialogo("✅ ¡Correcto! Muy bien.")
		
		pregunta_actual += 1
		var modulo = MODULOS["cueva"]
		if pregunta_actual < modulo["ejercicios"].size():
			await get_tree().create_timer(2.0).timeout
			_mostrar_ejercicios()
		else:
			_completar_modulo("cueva_selva", modulo["xp"])
	else:
		GameState.perder_vida()
		_actualizar_hud()
		_mostrar_dialogo("❌ No es correcto. Intenta de nuevo.")

func _on_respuesta_quiz(opcion: int, respuesta_correcta: int) -> void:
	if opcion == respuesta_correcta:
		GameState.responder_correcto()
		_actualizar_hud()
		_mostrar_dialogo("✅ ¡Correcto!")
		
		pregunta_actual += 1
		var modulo = MODULOS["rio"]
		if pregunta_actual < modulo["preguntas"].size():
			await get_tree().create_timer(1.5).timeout
			_mostrar_pregunta_quiz()
		else:
			_completar_modulo("rio_selva", modulo["xp"])
	else:
		GameState.perder_vida()
		_actualizar_hud()
		_mostrar_dialogo("❌ Incorrecto.")

func _mostrar_quiz() -> void:
	var modulo = MODULOS["rio"]
	_mostrar_dialogo("⏱️ ¡Quiz cronometrado! Tienes " + str(modulo["tiempo"]) + " segundos por pregunta.")
	await get_tree().create_timer(3.0).timeout
	_mostrar_pregunta_quiz()

func _mostrar_pregunta_quiz() -> void:
	var modulo = MODULOS["rio"]
	if pregunta_actual >= modulo["preguntas"].size():
		_completar_modulo("rio_selva", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	_mostrar_ejercicio_ui(pregunta)

func _mostrar_boss() -> void:
	var modulo = MODULOS["arbol"]
	_mostrar_dialogo("🌳 " + modulo["prueba"] + " ¡Demuestra tu conocimiento!")
	await get_tree().create_timer(4.0).timeout
	_mostrar_dialogo("Primera pregunta: ¿Por qué es importante conservar la selva?")
	# Aquí irían más preguntas del boss
	await get_tree().create_timer(5.0).timeout
	_completar_modulo("arbol_selva", modulo["xp"])
	_desbloquear_siguiente_zona()

func _completar_modulo(modulo_id: String, xp: int) -> void:
	GameState.completar_modulo(modulo_id)
	GameState.agregar_xp(xp)
	_actualizar_hud()
	_mostrar_dialogo("🎉 ¡Módulo completado! Has ganado " + str(xp) + " XP.")
	contenido_a2ui.visible = false
	
	await get_tree().create_timer(3.0).timeout
	dialogo_overlay.visible = false

func _desbloquear_siguiente_zona() -> void:
	if zona_actual == "arbol":
		GameState.desbloquear_zona(2)
		_mostrar_dialogo("🏆 ¡Felicitaciones! Has completado la Selva Amazónica. La siguiente zona (Altiplano Andino) ha sido desbloqueada.")

func _process(delta: float) -> void:
	var alas = $YaraContainer
	alas.scale.x = 1.0 + sin(Time.get_ticks_msec() * 0.01) * 0.05

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_salir()
	if event.is_action_pressed("ui_accept"):
		if dialogo_overlay.visible:
			dialogo_overlay.visible = false

func _salir() -> void:
	get_tree().change_scene_to_file("res://scenes/hub/LaGranColmena.tscn")