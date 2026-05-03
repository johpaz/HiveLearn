extends Node

signal mensaje_recibido(tipo: String, payload: Dictionary)
signal voz_recibida(audio_data: PackedByteArray)
signal conectado()
signal desconectado()
signal error_conexion(mensaje: String)

var ws: WebSocketPeer
const URL = "ws://localhost:8787"
var reconnect_delay: float = 2.0
var max_reconnect_attempts: int = 5
var reconnect_attempts: int = 0

var _is_connecting: bool = false
var _ultimo_estado: int = -1

func _ready() -> void:
	ws = WebSocketPeer.new()
	print("[NetworkManager] Iniciando conexion a: ", URL)

func _process(_delta: float) -> void:
	var estado = ws.get_ready_state()
	
	if estado == WebSocketPeer.STATE_OPEN:
		ws.poll()
		var packet = ws.get_packet()
		while packet.size() > 0:
			_procesar_mensaje(packet)
			packet = ws.get_packet()
		if _ultimo_estado != estado:
			print("[NetworkManager] Conectado!")
			reconnect_attempts = 0
			_is_connecting = false
			emit_signal("conectado")
	elif estado == WebSocketPeer.STATE_CLOSED:
		if _ultimo_estado != estado:
			var code = ws.get_close_code()
			var reason = ws.get_close_reason()
			print("[NetworkManager] Desconectado - Code: ", code)
			emit_signal("desconectado")
			_handle_disconnection()
	
	_ultimo_estado = estado

func _procesar_mensaje(data: PackedByteArray) -> void:
	var texto = data.get_string_from_utf8()
	if texto.is_valid_json():
		var json = JSON.new()
		var parse_result = json.parse(texto)
		if parse_result == OK:
			var msg = json.get_data()
			if typeof(msg) == TYPE_DICTIONARY:
				var tipo = msg.get("tipo", "")
				var payload = msg.get("payload", {})
				print("[NetworkManager] Mensaje: ", tipo)
				emit_signal("mensaje_recibido", tipo, payload)
	elif _is_binary_audio(data):
		emit_signal("voz_recibida", data)

func _handle_disconnection() -> void:
	if _is_connecting or reconnect_attempts < max_reconnect_attempts:
		reconnect_attempts += 1
		print("[NetworkManager] Reintentando ", reconnect_attempts, "/", max_reconnect_attempts)
		_is_connecting = false
		await get_tree().create_timer(reconnect_delay).timeout
		conectar()
	else:
		print("[NetworkManager] Maximo de intentos alcanzado")
		emit_signal("error_conexion", "No se pudo conectar")

func conectar() -> void:
	if _is_connecting:
		return
	_is_connecting = true
	var err = ws.connect_to_url(URL)
	if err != OK:
		print("[NetworkManager] Error al conectar: ", err)
		_is_connecting = false
		emit_signal("error_conexion", "Error de conexion")

func enviar(tipo: String, payload: Dictionary) -> bool:
	if ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return false
	var msg = {"tipo": tipo, "payload": payload, "timestamp": Time.get_datetime_string_from_system()}
	ws.send_text(JSON.stringify(msg))
	return true

func _is_binary_audio(data: PackedByteArray) -> bool:
	if data.size() < 4:
		return false
	var header = data.slice(0, 4).get_string_from_utf8()
	return header == "PCM:"

func esta_conectado() -> bool:
	return ws.get_ready_state() == WebSocketPeer.STATE_OPEN

func desconectar() -> void:
	ws.close()
	print("[NetworkManager] Desconectado manualmente")
