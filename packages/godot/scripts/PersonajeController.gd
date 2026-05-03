## PersonajeController.gd
## Controla cualquier Abeja Maestra: muestra sprite, burbuja de diálogo,
## reproduce voz TTS y reacciona a eventos del servidor via NetworkManager.
extends Node2D

signal dialogo_terminado()
signal interaccion_solicitada(personaje_id: String)

## Configuración del personaje (se setea desde la escena hija)
@export var personaje_id: String = "aria"
@export var nombre_personaje: String = "Reina Aria"
@export var sprite_idle: Texture2D
@export var color_burbuja: Color = Color(1.0, 0.9, 0.2)

## Nodos internos
@onready var sprite: Sprite2D = $Sprite2D
@onready var burbuja: CanvasLayer = $Burbuja
@onready var label_nombre: Label = $Burbuja/Panel/VBox/Nombre
@onready var label_texto: Label = $Burbuja/Panel/VBox/Texto
@onready var animacion: AnimationPlayer = $AnimationPlayer
@onready var timer_dialogo: Timer = $TimerDialogo

## Estado
var _hablando: bool = false
var _cola_dialogos: Array[String] = []
var _texto_velocidad: float = 0.04  # segundos por caracter

func _ready() -> void:
	label_nombre.text = nombre_personaje
	burbuja.visible = false
	if sprite_idle:
		sprite.texture = sprite_idle
	_conectar_network()

func _conectar_network() -> void:
	if not NetworkManager.is_connected("mensaje_recibido", _on_mensaje_servidor):
		NetworkManager.mensaje_recibido.connect(_on_mensaje_servidor)
	if not AudioManager.is_connected("voz_lista", _on_voz_lista):
		AudioManager.voz_lista.connect(_on_voz_lista)

## ─── API pública ─────────────────────────────────────────────────────────────

func hablar(texto: String, duracion: float = 0.0) -> void:
	if _hablando:
		_cola_dialogos.append(texto)
		return
	_mostrar_dialogo(texto, duracion)

func hablar_cola(textos: Array[String]) -> void:
	for t in textos:
		_cola_dialogos.append(t)
	_siguiente_dialogo()

func celebrar() -> void:
	if animacion.has_animation("celebrar"):
		animacion.play("celebrar")
	else:
		_animar_salto()

func reaccionar_correcto() -> void:
	_animar_salto()
	var frases = _frases_correcto()
	hablar(frases[randi() % frases.size()])

func reaccionar_incorrecto() -> void:
	_animar_shake()
	var frases = _frases_incorrecto()
	hablar(frases[randi() % frases.size()])

func ocultar_dialogo() -> void:
	burbuja.visible = false
	_hablando = false

## ─── Mensajes del servidor ───────────────────────────────────────────────────

func _on_mensaje_servidor(tipo: String, payload: Dictionary) -> void:
	var destinatario = payload.get("personaje", "")
	if destinatario != personaje_id and destinatario != "":
		return

	match tipo:
		"bienvenida":
			var msg = payload.get("mensaje_agente", "")
			if msg:
				hablar(msg)
		"contenido":
			var texto_agente = _extraer_texto_agente(payload)
			if texto_agente:
				hablar(texto_agente)
		"resultado":
			var correcto = payload.get("calificacion", "") == "correcto"
			var feedback = payload.get("feedback", "")
			if correcto:
				reaccionar_correcto()
			else:
				reaccionar_incorrecto()
			if feedback:
				await get_tree().create_timer(1.2).timeout
				hablar(feedback)
		"nivel_up":
			celebrar()
			hablar(payload.get("mensaje", "¡Subiste de nivel!"))
		"logro":
			celebrar()
			hablar("¡Lograste: " + payload.get("nombre", "") + "!")

func _extraer_texto_agente(payload: Dictionary) -> String:
	var a2ui = payload.get("a2ui_messages", [])
	for msg in a2ui:
		var su = msg.get("surfaceUpdate", {})
		for comp in su.get("components", []):
			var c = comp.get("component", {})
			if c.has("text"):
				return str(c["text"])
	return ""

## ─── Diálogo con typewriter ──────────────────────────────────────────────────

func _mostrar_dialogo(texto: String, duracion: float) -> void:
	_hablando = true
	burbuja.visible = true
	label_texto.text = ""
	_animar_idle_habla()

	for i in texto.length():
		label_texto.text = texto.substr(0, i + 1)
		await get_tree().create_timer(_texto_velocidad).timeout

	var espera = duracion if duracion > 0.0 else max(2.0, texto.length() * 0.045)
	await get_tree().create_timer(espera).timeout
	_siguiente_dialogo()

func _siguiente_dialogo() -> void:
	if _cola_dialogos.is_empty():
		ocultar_dialogo()
		emit_signal("dialogo_terminado")
		return
	var siguiente = _cola_dialogos.pop_front()
	_mostrar_dialogo(siguiente, 0.0)

## ─── Voz TTS ─────────────────────────────────────────────────────────────────

func _on_voz_lista(para_personaje: String) -> void:
	if para_personaje != personaje_id:
		return
	_animar_idle_habla()

## ─── Animaciones procedurales ────────────────────────────────────────────────

func _animar_salto() -> void:
	var tween = create_tween().set_trans(Tween.TRANS_BOUNCE)
	tween.tween_property(sprite, "position:y", sprite.position.y - 12, 0.15)
	tween.tween_property(sprite, "position:y", sprite.position.y, 0.25)

func _animar_shake() -> void:
	var origen = sprite.position.x
	var tween = create_tween()
	for _i in 3:
		tween.tween_property(sprite, "position:x", origen + 5, 0.05)
		tween.tween_property(sprite, "position:x", origen - 5, 0.05)
	tween.tween_property(sprite, "position:x", origen, 0.05)

func _animar_idle_habla() -> void:
	if animacion.has_animation("hablar"):
		animacion.play("hablar")

## ─── Frases por personaje ────────────────────────────────────────────────────

func _frases_correcto() -> Array[String]:
	match personaje_id:
		"aria":   return ["¡Exacto! Cada respuesta enciende la colmena. ✨", "¡Brillante, zumbador/a!"]
		"yara":   return ["¡GRR! ¡Eso estuvo perfecto, como jaguar que atrapa!", "¡La selva te aplaude!"]
		"kimi":   return ["El cóndor ve el patrón. Correcto.", "Los números no mienten. ¡Bien hecho!"]
		"ix":     return ["El cenote revela su secreto. ¡Correcto!", "Los mayas sonríen desde el tiempo."]
		"nova":   return ["¡Compilando! CORRECTO. +XP cargados. 🚀", "¡Bug eliminado! Eres un coder nato."]
		"chacho": return ["¡Eso sí, pana! Bien dicho como gaucho.", "¡Correcto! Eso lo diría el Martín Fierro."]
		"cosmo":  return ["¡Esa respuesta viajó a la velocidad de la luz!", "¡El universo confirma tu respuesta!"]
	return ["¡Correcto! ¡Muy bien!"]

func _frases_incorrecto() -> Array[String]:
	match personaje_id:
		"aria":   return ["No existe el error, solo miel que aún no probaste. Intenta otra vez."]
		"yara":   return ["La selva enseña con paciencia. Volvamos a intentarlo."]
		"kimi":   return ["Cada error es una piedra en tu camino. Sortéala."]
		"ix":     return ["El cenote guarda el secreto aún. Busca más profundo."]
		"nova":   return ["Error 404: respuesta no encontrada. ¡Hacemos debug juntos?"]
		"chacho": return ["El gaucho que no acierta a la primera, afina el lazo. De nuevo."]
		"cosmo":  return ["Los mejores científicos fallaron primero. Sigamos explorando."]
	return ["Casi. Intenta de nuevo."]
