extends Node

signal mensaje_recibido(tipo: String, payload: Dictionary)
signal voz_recibida(audio_data: PackedByteArray)
signal conectado()
signal desconectado()
signal error_conexion(mensaje: String)

var ws: WebSocketPeer
const URL = "ws://localhost:8787"
var reconnect_timer: float = 0.0
var reconnect_delay: float = 2.0
var max_reconnect_attempts: int = 5
var reconnect_attempts: int = 0

var _is_connecting: bool = false

func _ready() -> void:
	ws = WebSocketPeer.new()
	ws.sig_connected.connect(_on_connected)
	ws.sig_disconnected.connect(_on_disconnected)
	ws.sig_data_received.connect(_on_data_received)
	ws.sig_error.connect(_on_error)
	print("[NetworkManager] Iniciando conexion a: ", URL)

func _process(delta: float) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_CONNECTING:
		pass
	elif ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.poll()
	elif ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_handle_disconnection()

func conectar() -> void:
	if _is_connecting:
		return
	_is_connecting = true
	var err = ws.connect_to_url(URL)
	if err != OK:
		print("[NetworkManager] Error al conectar: ", err)
		_is_connecting = false
		emit_signal("error_conexion", "No se pudo iniciar la conexion")

func _on_connected() -> void:
	print("[NetworkManager] Conectado al backend")
	reconnect_attempts = 0
	_is_connecting = false
	emit_signal("conectado")

func _on_disconnected(code: int, reason: String) -> void:
	print("[NetworkManager] Desconectado - Code: ", code, " Reason: ", reason)
	emit_signal("desconectado")
	_handle_disconnection()

func _on_data_received() -> void:
	var data = ws.get_packet()
	var texto = data.get_string_from_utf8()
	if texto.is_valid_json():
		var json = JSON.new()
		var parse_result = json.parse(texto)
		if parse_result == OK:
			var msg = json.get_data()
			if typeof(msg) == TYPE_DICTIONARY:
				var tipo = msg.get("tipo", "")
				var payload = msg.get("payload", {})
				print("[NetworkManager] Mensaje recibido: ", tipo)
				emit_signal("mensaje_recibido", tipo, payload)
			elif data.size() > 0 and _is_audio_packet(msg):
				emit_signal("voz_recibida", data)
	elif _is_binary_audio(data):
		emit_signal("voz_recibida", data)

func _on_error() -> void:
	print("[NetworkManager] Error en WebSocket")
	emit_signal("error_conexion", "Error de comunicacion")

func _handle_disconnection() -> void:
	if reconnect_attempts < max_reconnect_attempts:
		reconnect_attempts += 1
		print("[NetworkManager] Reintentando conexion ", reconnect_attempts, "/", max_reconnect_attempts)
		await get_tree().create_timer(reconnect_delay).timeout
		conectar()
	else:
		print("[NetworkManager] Maximo de intentos de reconexion alcanzado")
		emit_signal("error_conexion", "No se pudo conectar al servidor")

func enviar(tipo: String, payload: Dictionary) -> bool:
	if ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		print("[NetworkManager] No conectado, no se puede enviar: ", tipo)
		return false
	
	var msg = {
		"tipo": tipo,
		"payload": payload,
		"timestamp": Time.get_datetime_string_from_system()
	}
	var json_string = JSON.stringify(msg)
	ws.send_text(json_string)
	print("[NetworkManager] Enviado: ", tipo)
	return true

func enviar_binario(data: PackedByteArray) -> bool:
	if ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return false
	ws.send(data)
	return true

func _is_audio_packet(msg: Variant) -> bool:
	return typeof(msg) == TYPE_STRING and msg.begins_with("AUDIO:")

func _is_binary_audio(data: PackedByteArray) -> bool:
	if data.size() < 4:
		return false
	var header = data.slice(0, 4).get_string_from_utf8()
	return header == "PCM:" or data[0] == 0xFF or data[0] == 0x49 or data[0] == 0x4D

func esta_conectado() -> bool:
	return ws.get_ready_state() == WebSocketPeer.STATE_OPEN

func desconectar() -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN or ws.get_ready_state() == WebSocketPeer.STATE_CONNECTING:
		ws.close()
		print("[NetworkManager] Desconectado manualmente")