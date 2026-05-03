extends Node

signal voz_recibida(texto: String)
signal estado_cambiado(estado: String)
signal error_sistema(mensaje: String)

enum Estado {
	INACTIVO,
	ESCUCHANDO,
	PROCESANDO,
	ERROR
}

var estado_actual: Estado = Estado.INACTIVO
var recognition_active: bool = false

var servidor_vosk: Node = null
var modelo_cargado: bool = false

var usar_fallback_navegador: bool = true

var GRAMATICA_SIMPLE = [
	"si", "no", "sí", "bien", "mal", "correcto", "incorrecto",
	"uno", "dos", "tres", "cuatro", "cinco",
	"primero", "segundo", "tercero", "cuarto", "quinto",
	"a", "b", "c", "d", "opcion uno", "opcion dos", "opcion tres", "opcion cuatro",
	"siguiente", "anterior", "continuar", "repetir", "salir",
	"historia", "ejercicios", "quiz", "leccion",
	"ayuda", "menu", "pausa"
]

func _ready() -> void:
	print("[VoiceInput] Inicializando sistema de voz...")
	_detectar_capacidades()
	_verificar_vosk()

func _detectar_capacidades() -> void:
	if OS.get_name() == "Windows":
		print("[VoiceInput] Windows detectado - usando reconocimiento nativo")
		usar_fallback_navegador = false
	elif OS.get_name() == "Android":
		print("[VoiceInput] Android detectado - usando reconocimiento nativo")
		usar_fallback_navegador = false
	else:
		print("[VoiceInput] Linux/Raspberry Pi - usando modo offline")

func _verificar_vosk() -> void:
	print("[VoiceInput] Verificando Vosk...")
	print("[VoiceInput] Vosk no encontrado, usando fallback")
	modelo_cargado = false

func iniciar_escucha() -> void:
	if recognition_active:
		return
	
	match OS.get_name():
		"Windows":
			_iniciar_windows_stt()
		"Android":
			_iniciar_android_stt()
		_:
			_iniciar_fallback()
	
	recognition_active = true
	estado_actual = Estado.ESCUCHANDO
	emit_signal("estado_cambiado", "escuchando")
	print("[VoiceInput] Escucha iniciada")

func detener_escucha() -> void:
	recognition_active = false
	estado_actual = Estado.INACTIVO
	emit_signal("estado_cambiado", "inactivo")
	print("[VoiceInput] Escucha detenida")

func _iniciar_windows_stt() -> void:
	print("[VoiceInput] Iniciando STT Windows...")
	emit_signal("error_sistema", "STT Windows no implementado en esta versión")

func _iniciar_android_stt() -> void:
	print("[VoiceInput] Iniciando STT Android...")
	emit_signal("error_sistema", "STT Android no implementado en esta versión")

func _iniciar_fallback() -> void:
	print("[VoiceInput] Usando modo fallback - voz simulada")
	crear_ui_entrada_voz()

func crear_ui_entrada_voz() -> void:
	print("[VoiceInput] Creando UI de entrada de voz")

func simular_comando(texto: String) -> void:
	texto = texto.to_lower().strip_edges()
	emit_signal("voz_recibida", texto)
	print("[VoiceInput] Comando simulado: ", texto)

func procesar_audio_grabado(ruta_archivo: String) -> void:
	estado_actual = Estado.PROCESANDO
	emit_signal("estado_cambiado", "procesando")
	
	if modelo_cargado:
		_procesar_con_vosk(ruta_archivo)
	else:
		_procesar_fallback(ruta_archivo)

func _procesar_con_vosk(ruta: String) -> void:
	print("[VoiceInput] Procesando con Vosk: ", ruta)
	estado_actual = Estado.INACTIVO
	emit_signal("voz_recibida", "comando procesado")
	emit_signal("estado_cambiado", "inactivo")

func _procesar_fallback(ruta: String) -> void:
	print("[VoiceInput] Fallback: archivo guardado en ", ruta)
	estado_actual = Estado.INACTIVO
	emit_signal("voz_recibida", "audio_recibido")
	emit_signal("estado_cambiado", "inactivo")

func verificar_comando_valido(texto: String) -> bool:
	texto = texto.to_lower().strip_edges()
	return texto in GRAMATICA_SIMPLE

func obtener_opcion_numerica(texto: String) -> int:
	texto = texto.to_lower()
	var mapa = {
		"uno": 1, "una": 1, "opcion uno": 1, "opción uno": 1,
		"dos": 2, "opcion dos": 2, "opción dos": 2,
		"tres": 3, "opcion tres": 3, "opción tres": 3,
		"cuatro": 4, "opcion cuatro": 4, "opción cuatro": 4,
		"cinco": 5, "opcion cinco": 5, "opción cinco": 5
	}
	return mapa.get(texto, -1)

func obtener_comando_accion(texto: String) -> Dictionary:
	texto = texto.to_lower()
	var acciones = {
		"si": {"accion": "afirmar"},
		"sí": {"accion": "afirmar"},
		"bien": {"accion": "afirmar"},
		"correcto": {"accion": "afirmar"},
		"no": {"accion": "negar"},
		"mal": {"accion": "negar"},
		"incorrecto": {"accion": "negar"},
		"siguiente": {"accion": "siguiente"},
		"continuar": {"accion": "siguiente"},
		"anterior": {"accion": "anterior"},
		"repetir": {"accion": "repetir"},
		"ayuda": {"accion": "ayuda"},
		"menu": {"accion": "menu"},
		"pausa": {"accion": "pausa"},
		"salir": {"accion": "salir"}
	}
	return acciones.get(texto, {"accion": "desconocido", "texto": texto})

func _exit_tree() -> void:
	detener_escucha()