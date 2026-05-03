extends Node2D

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"fauna": {
		"titulo": "Fauna del Amazonas",
		"lecciones": [
			{"titulo": "La Selva Amazônica", "contenido": "La selva amazónica de Brasil es la más grande del mundo. Tiene más especies de plantas y animales que cualquier otro lugar. Es el 'pulmón del planeta'."},
			{"titulo": "Los Animales Únicos", "contenido": "Brasil tiene animales únicos: el jaguar (el más grande de América), la arara (loro de colores), el tucunaré (pez favorito) y el boto (delfín rosado)."},
			{"titulo": "La Biodiversidad", "contenido": "Brasil tiene más de 50,000 especies de árboles, 3,000 tipos de peces y 1,600 especies de aves. ¡La selva nunca termina de sorprendernos!"},
			{"titulo": "La Cosmovisión Indígena", "contenido": "Los pueblos indígenas de Brasil tienen historias sobre los animales. El 'Curupira' protege la selva con sus pies al revés. El 'Boiuna' es una serpiente gigante de los ríos."}
		],
		"xp": 50
	},
	"mitologia": {
		"titulo": "Mitología Brasileña",
		"ejercicios": [
			{"pregunta": "¿Cuál es el animal más grande de Brasil?", "opciones": ["León", "Jaguar", "Tigre", "Leopardo"], "respuesta": 1},
			{"pregunta": "La selva amazónica es:", "opciones": ["La más pequeña", "La más grande del mundo", "La segunda", "No existe"], "respuesta": 1},
			{"pregunta": "El 'Curupira' es:", "opciones": ["Un pez", "Un espíritu protector", "Un pájaro", "Una flor"], "respuesta": 1},
			{"pregunta": "El 'Boiuna' es:", "opciones": ["Un mono", "Una serpiente", "Un pez", "Un jaguar"], "respuesta": 1},
			{"pregunta": "Brasil tiene aproximadamente cuántas especies de árboles?", "opciones": ["10,000", "30,000", "50,000", "100,000"], "respuesta": 2}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz Brasileño",
		"preguntas": [
			{"pregunta": "Brasil tiene más de cuántos tipos de peces?", "opciones": ["1,000", "2,000", "3,000", "5,000"], "respuesta": 2},
			{"pregunta": "¿Cómo se llama el delfín rosado del Amazonas?", "opciones": ["Boto", "Tucuxi", "Orca", "Marsopa"], "respuesta": 0},
			{"pregunta": "¿Por qué la selva amazónica es importante?", "opciones": ["Es decorativa", "Es el 'pulmón del planeta'", "Solo tiene monos", "No tiene importancia"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI

func _ready() -> void:
	_dibujar_arara()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_arara() -> void:
	var arara = $AraraContainer
	var cuerpo = Polygon2D.new()
	cuerpo.polygon = PackedVector2Array([Vector2(0, -15), Vector2(20, 5), Vector2(15, 20), Vector2(-15, 20), Vector2(-20, 5)])
	cuerpo.color = Color(0.9, 0.2, 0.1, 1)
	arara.add_child(cuerpo)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(15, -10), Vector2(30, -20), Vector2(25, -5)])
	cabeza.color = Color(0.95, 0.25, 0.15, 1)
	arara.add_child(cabeza)
	
	var crest = Polygon2D.new()
	crest.polygon = PackedVector2Array([Vector2(20, -18), Vector2(28, -30), Vector2(25, -15)])
	crest.color = Color(0.85, 0.15, 0.1, 1)
	arara.add_child(crest)
	
	var pico = Polygon2D.new()
	pico.polygon = PackedVector2Array([Vector2(28, -15), Vector2(40, -10), Vector2(30, -8)])
	pico.color = Color(0.2, 0.2, 0.2, 1)
	arara.add_child(pico)
	
	var ala1 = Polygon2D.new()
	ala1.polygon = PackedVector2Array([Vector2(-10, -5), Vector2(-30, -20), Vector2(-20, 5)])
	ala1.color = Color(0.85, 0.15, 0.1, 1)
	arara.add_child(ala1)
	
	var ala2 = Polygon2D.new()
	ala2.polygon = PackedVector2Array([Vector2(10, 0), Vector2(25, -25), Vector2(15, 10)])
	ala2.color = Color(0.2, 0.5, 0.8, 1)
	arara.add_child(ala2)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		$HUD/TopBar/HBox/XP.text = "XP: " + str(GameState.xp_actual)
		var vidas = ""
		for i in range(GameState.vidas):
			vidas += "❤️"
		$HUD/TopBar/HBox/VidasLabel.text = vidas

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🦜 ¡Bem-vindo à Amazônia! Sou Jacaré, la araña monitore. Explora la increíble fauna y mitología del bosque más grande del mundo.")

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
		"fauna": return true
		"mitologia": return "fauna_brasil" in progreso
		"quiz": return "mitologia_brasil" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"fauna": _mostrar_lecciones()
		"mitologia": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

func _mostrar_lecciones() -> void:
	var modulo = MODULOS["fauna"]
	_mostrar_dialogo("🌳 " + modulo["lecciones"][0]["contenido"])
	await get_tree().create_timer(8.0).timeout
	_continuar_leccion(1)

func _continuar_leccion(indice: int) -> void:
	var modulo = MODULOS["fauna"]
	if indice < modulo["lecciones"].size():
		_mostrar_dialogo("🌳 " + modulo["lecciones"][indice]["contenido"])
		await get_tree().create_timer(8.0).timeout
		_continuar_leccion(indice + 1)
	else:
		_completar_modulo("fauna_brasil", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["mitologia"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("mitologia_brasil", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🦎 Mitología " + str(pregunta_actual + 1)
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
		_completar_modulo("quiz_brasil", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏆 Quiz Brasileño"
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
		if modulo_actual == "mitologia":
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
	$AraraContainer.position.x += cos(Time.get_ticks_msec() * 0.003) * 0.3