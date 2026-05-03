## A2UIRenderer.gd
## Singleton que recibe el programa A2UI del coordinador via WebSocket
## y lo renderiza en Godot como nodos interactivos dentro de la escena activa.
extends Node

signal nodo_completado(nodo_id: String, xp: int)
signal programa_completo(resumen: Dictionary)
signal respuesta_enviada(nodo_id: String, valor: String)

## Referencia al contenedor donde se renderizan los nodos
var contenedor_activo: Control = null

## Programa actual (LessonProgram del coordinador)
var _programa: Dictionary = {}
var _nodo_actual_idx: int = 0
var _nodos: Array = []

var ESCENA_NODO_QUIZ: PackedScene
var ESCENA_NODO_TEXTO: PackedScene
var ESCENA_NODO_EJERCICIO: PackedScene

func _ready() -> void:
	_cargar_escenas_ui()
	NetworkManager.mensaje_recibido.connect(_on_mensaje)

func _cargar_escenas_ui() -> void:
	if ResourceLoader.exists("res://scenes/ui/NodoQuiz.tscn"):
		ESCENA_NODO_QUIZ = load("res://scenes/ui/NodoQuiz.tscn")
	if ResourceLoader.exists("res://scenes/ui/NodoTexto.tscn"):
		ESCENA_NODO_TEXTO = load("res://scenes/ui/NodoTexto.tscn")
	if ResourceLoader.exists("res://scenes/ui/NodoEjercicio.tscn"):
		ESCENA_NODO_EJERCICIO = load("res://scenes/ui/NodoEjercicio.tscn")
	NetworkManager.mensaje_recibido.connect(_on_mensaje)

## ─── Recibe mensajes del servidor ────────────────────────────────────────────

func _on_mensaje(tipo: String, payload: Dictionary) -> void:
	match tipo:
		"contenido":
			_renderizar_a2ui(payload)
		"resultado":
			_mostrar_resultado(payload)
		"nivel_up":
			_mostrar_nivel_up(payload)
		"logro":
			_mostrar_logro(payload)
		"completar":
			_on_programa_completo(payload)

## ─── Renderizado de nodos A2UI ───────────────────────────────────────────────

func _renderizar_a2ui(payload: Dictionary) -> void:
	if contenedor_activo == null:
		push_warning("[A2UIRenderer] Sin contenedor activo")
		return

	var tipo_nodo = payload.get("tipo", "")
	var a2ui_msgs = payload.get("a2ui_messages", [])
	var personaje = payload.get("personaje", "aria")

	_limpiar_contenedor()

	match tipo_nodo:
		"quiz":
			_renderizar_quiz(a2ui_msgs, personaje)
		"ejercicio":
			_renderizar_ejercicio(a2ui_msgs, personaje)
		"explicacion", "svg", "gif", "infografia":
			_renderizar_texto(a2ui_msgs, personaje)
		"evaluacion":
			_renderizar_evaluacion(a2ui_msgs, personaje)
		_:
			_renderizar_texto(a2ui_msgs, personaje)

func _renderizar_quiz(msgs: Array, personaje: String) -> void:
	var datos = _extraer_datos_a2ui(msgs)
	if ESCENA_NODO_QUIZ == null:
		_renderizar_fallback(datos)
		return
	var nodo = ESCENA_NODO_QUIZ.instantiate()
	contenedor_activo.add_child(nodo)
	if nodo.has_method("configurar"):
		nodo.configurar(datos, personaje)
	nodo.respuesta_seleccionada.connect(_on_respuesta)

func _renderizar_ejercicio(msgs: Array, personaje: String) -> void:
	var datos = _extraer_datos_a2ui(msgs)
	if ESCENA_NODO_EJERCICIO == null:
		_renderizar_fallback(datos)
		return
	var nodo = ESCENA_NODO_EJERCICIO.instantiate()
	contenedor_activo.add_child(nodo)
	if nodo.has_method("configurar"):
		nodo.configurar(datos, personaje)

func _renderizar_texto(msgs: Array, _personaje: String) -> void:
	var datos = _extraer_datos_a2ui(msgs)
	if ESCENA_NODO_TEXTO == null:
		_renderizar_fallback(datos)
		return
	var nodo = ESCENA_NODO_TEXTO.instantiate()
	contenedor_activo.add_child(nodo)
	if nodo.has_method("configurar"):
		nodo.configurar(datos)

func _renderizar_evaluacion(msgs: Array, personaje: String) -> void:
	_renderizar_quiz(msgs, personaje)

func _renderizar_fallback(datos: Dictionary) -> void:
	var label = Label.new()
	label.text = datos.get("texto", "...")
	label.autowrap_mode = TextServer.AUTOWRAP_WORD
	contenedor_activo.add_child(label)

## ─── Resultado de evaluación ─────────────────────────────────────────────────

func _mostrar_resultado(payload: Dictionary) -> void:
	var calificacion = payload.get("calificacion", "")
	var xp = payload.get("xp", 0)
	var nodo_id = payload.get("nodo_id", "")

	GameState.agregar_xp(xp)

	if calificacion == "correcto":
		GameState.responder_correcto()
	else:
		GameState.respuesta_incorrecta()
		if payload.get("vidas_perdidas", false):
			GameState.perder_vida()

	emit_signal("nodo_completado", nodo_id, xp)

	var siguiente = payload.get("siguiente", {})
	if siguiente:
		await get_tree().create_timer(1.5).timeout
		_avanzar_siguiente(siguiente)

func _avanzar_siguiente(sig: Dictionary) -> void:
	NetworkManager.enviar("accion", {
		"tipo": "avanzar",
		"modulo_uuid": sig.get("modulo_uuid", ""),
		"animacion": sig.get("animacion_transicion", "caminar")
	})

func _mostrar_nivel_up(payload: Dictionary) -> void:
	GameState.nivel_actual = payload.get("nivel_nuevo", GameState.nivel_actual)
	emit_signal("nodo_completado", "nivel_up", 0)

func _mostrar_logro(payload: Dictionary) -> void:
	var logro = {
		"nombre": payload.get("nombre", ""),
		"descripcion": payload.get("descripcion", ""),
		"xp_bonus": payload.get("xp_bonus", 0)
	}
	GameState.logros.append(logro)

func _on_programa_completo(payload: Dictionary) -> void:
	emit_signal("programa_completo", payload.get("resumen_final", {}))

## ─── Respuesta del alumno ────────────────────────────────────────────────────

func _on_respuesta(nodo_id: String, valor: String) -> void:
	emit_signal("respuesta_enviada", nodo_id, valor)
	NetworkManager.enviar("responder", {
		"nodo_id": nodo_id,
		"respuesta": { "tipo": "multiple_choice", "valores": [valor] },
		"alumno_id": GameState.alumno_id,
		"session_id": GameState.sesion_id
	})

## ─── Utilidades ──────────────────────────────────────────────────────────────

func _extraer_datos_a2ui(msgs: Array) -> Dictionary:
	var resultado = { "texto": "", "opciones": [], "imagen_svg": "", "nodo_id": "" }
	for msg in msgs:
		var su = msg.get("surfaceUpdate", {})
		for comp in su.get("components", []):
			var c = comp.get("component", {})
			if c.has("text") and resultado["texto"] == "":
				resultado["texto"] = str(c["text"])
			if c.has("options"):
				resultado["opciones"] = c["options"]
			if c.has("svg"):
				resultado["imagen_svg"] = str(c["svg"])
		resultado["nodo_id"] = su.get("surfaceId", "")
	return resultado

func _limpiar_contenedor() -> void:
	if contenedor_activo == null:
		return
	for hijo in contenedor_activo.get_children():
		hijo.queue_free()

func set_contenedor(nodo: Control) -> void:
	contenedor_activo = nodo
