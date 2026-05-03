extends Node2D

enum TipoZona { HISTORIA, INGENIERIA, QUIZ }

var zona_actual: String = ""
var modulo_actual: String = ""
var pregunta_actual: int = 0

const MODULOS = {
	"historia": {
		"titulo": "Historia del Tahuantinsuyu",
		"lecciones": [
			{"titulo": "El Imperio Inca", "contenido": "El Tawantinsuyu (Imperio Inca) fue el imperio más grande de América. Se extendía desde Colombia hasta Chile, gobernado por el Sapa Inca desde Cusco."},
			{"titulo": "Machu Picchu", "contenido": "Machu Picchu es una ciudad inca ubicada a 2,430 metros de altura. Fue construida sin usar metal, ruedas ni animales de carga. ¡Toda la piedra se cortó con herramientas de bronce!"},
			{"titulo": "El Camino Inca", "contenido": "El Qhapaq Ñan era un camino de 30,000 km que cruzaba los Andes. Los mensajeros (chasquis) podían correr 240 km en un día para llevar mensajes."},
			{"titulo": "Cusco - Ombligo del Mundo", "contenido": "Cusco significa 'ombligo' en quechua. Los incas creían que era el centro del mundo. La ciudad tiene forma de puma y fue diseñada con precisión increíble."}
		],
		"xp": 50
	},
	"ingenieria": {
		"titulo": "Ingeniería Inca",
		"ejercicios": [
			{"pregunta": "¿Qué material usaban los incas para construir sus edificios?", "opciones": ["Adobe", "Piedra tallada", "Madera", "Barro"], "respuesta": 1},
			{"pregunta": "Los andenes (terrazas) incas servían para:", "opciones": ["Decoración", "Agricultura", "Defensa", "Religión"], "respuesta": 1},
			{"pregunta": "¿Cómo llamaban los incas a sus mensajeros?", "opciones": ["Runas", "Chasquis", "Ayllus", "Orejones"], "respuesta": 1},
			{"pregunta": "El sistema de knots (quipus) servía para:", "opciones": ["Contabilidad", "Música", "Cocina", "Vestimenta"], "respuesta": 0},
			{"pregunta": "Machu Picchu está ubicada en:", "opciones": ["Lima", "Cusco", "Arequipa", "Trujillo"], "respuesta": 1}
		],
		"xp": 75
	},
	"quiz": {
		"titulo": "Quiz del Imperio",
		"preguntas": [
			{"pregunta": "¿Cuál era la capital del Imperio Inca?", "opciones": ["Lima", "Cusco", "Machu Picchu", "Tiwanaku"], "respuesta": 1},
			{"pregunta": "¿Cuántos kilómetros medía el Camino Inca?", "opciones": ["10,000 km", "20,000 km", "30,000 km", "40,000 km"], "respuesta": 2},
			{"pregunta": "Los incas no utilizaban:", "opciones": ["Bronce", "Ruedas", "Cobre", "Oro"], "respuesta": 1}
		],
		"xp": 100,
		"tiempo": 25
	}
}

@onready var dialogo_overlay = $DialogoOverlay
@onready var contenido_a2ui = $ContenidoA2UI
@onready var hud_xp = $HUD/TopBar/HBox/XP
@onready var hud_vidas = $HUD/TopBar/HBox/VidasLabel

func _ready() -> void:
	_dibujar_llama()
	_actualizar_hud()
	_mostrar_bienvenida()

func _dibujar_llama() -> void:
	var llama = $LlamaContainer
	var cuerpo = Polygon2D.new()
	var puntos = PackedVector2Array([
		Vector2(0, -30), Vector2(25, 0), Vector2(20, 30), 
		Vector2(-20, 30), Vector2(-25, 0)
	])
	cuerpo.polygon = puntos
	cuerpo.color = Color(0.85, 0.75, 0.6, 1)
	llama.add_child(cuerpo)
	
	var cuello = Polygon2D.new()
	cuello.polygon = PackedVector2Array([Vector2(20, -30), Vector2(30, -60), Vector2(15, -60), Vector2(10, -30)])
	cuello.color = Color(0.8, 0.7, 0.55, 1)
	llama.add_child(cuello)
	
	var cabeza = Polygon2D.new()
	cabeza.polygon = PackedVector2Array([Vector2(15, -60), Vector2(25, -70), Vector2(20, -55)])
	cabeza.color = Color(0.85, 0.75, 0.6, 1)
	llama.add_child(cabeza)
	
	for i in range(4):
		var patita = Polygon2D.new()
		patita.polygon = PackedVector2Array([Vector2(-10 + i*8, 30), Vector2(-8 + i*8, 45), Vector2(-4 + i*8, 45), Vector2(-2 + i*8, 30)])
		patita.color = Color(0.7, 0.6, 0.5, 1)
		llama.add_child(patita)

func _actualizar_hud() -> void:
	if has_node("/root/GameState"):
		hud_xp.text = "XP: " + str(GameState.xp_actual)
		var vidas_str = ""
		for i in range(GameState.vidas):
			vidas_str += "❤️"
		hud_vidas.text = vidas_str

func _mostrar_bienvenida() -> void:
	_mostrar_dialogo("🦙 ¡Bienvenido a Machu Picchu! Soy Killa la llama. Descubre los secretos delgran imperio inca y su increíble ingeniería.")

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
		"historia": return true
		"ingenieria": return "historia_inca" in progreso
		"quiz": return "ingenieria_inca" in progreso
	return false

func _iniciar_zona(tipo_zona: String) -> void:
	if not MODULOS.has(tipo_zona):
		return
	modulo_actual = tipo_zona
	pregunta_actual = 0
	match tipo_zona:
		"historia": _mostrar_lecciones()
		"ingenieria": _mostrar_ejercicios()
		"quiz": _mostrar_quiz()

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
		_completar_modulo("historia_inca", modulo["xp"])

func _mostrar_ejercicios() -> void:
	_mostrar_ejercicio()

func _mostrar_ejercicio() -> void:
	var modulo = MODULOS["ingenieria"]
	if pregunta_actual >= modulo["ejercicios"].size():
		_completar_modulo("ingenieria_inca", modulo["xp"])
		return
	
	var ejercicio = modulo["ejercicios"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🔧 Ingeniería " + str(pregunta_actual + 1)
	vbox.get_node("Contenido").text = "🏛️ " + ejercicio["pregunta"]
	
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
		_completar_modulo("quiz_inca", modulo["xp"])
		return
	
	var pregunta = modulo["preguntas"][pregunta_actual]
	var vbox = $ContenidoA2UI/Scroll/VBox
	vbox.get_node("Titulo").text = "🏛️ Quiz Inca"
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
		if modulo_actual == "ingenieria":
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
	$LlamaContainer.rotation = sin(Time.get_ticks_msec() * 0.002) * 0.03