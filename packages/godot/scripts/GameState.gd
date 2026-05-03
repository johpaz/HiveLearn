extends Node

signal jugador_actualizado()
signal progreso_actualizado()
signal nivel_actualizado(nivel: int)
signal zona_desbloqueada(zona: int)
signal logro_desbloqueado(logro: Dictionary)

enum EstadoJuego {
	TITULO,
	ONBOARDING,
	HUB,
	MINI_MUNDO,
	DIALOGO,
	PREGUNTA
}

var estado_actual: EstadoJuego = EstadoJuego.TITULO

var alumno_id: String = ""
var nickname: String = ""
var avatar: String = "abeja_amarilla"
var edad_rango: String = ""
var estilo_aprendizaje: String = "visual"

var xp_actual: int = 0
var nivel_actual: int = 1
var vidas: int = 3
var racha: int = 0
var max_racha: int = 0
var preguntas_respondidas_voz: int = 0

var zonas_desbloqueadas: Array = [1]
var modulos_completados: Array = []
var logros: Array = []
var logros_desbloqueados: Array = []
var total_xp_acumulado: int = 0

const LOGROS = {
	"primera_chispa": {"nombre": "Primera Chispa", "descripcion": "Completa tu primer modulo", "raro": false},
	"voz_selva": {"nombre": "Voz de la Selva", "descripcion": "Responde 5 preguntas por voz", "raro": false},
	"racha_oro": {"nombre": "Racha de Oro", "descripcion": "10 respuestas correctas seguidas", "raro": true},
	"explorador_andino": {"nombre": "Explorador Andino", "descripcion": "Entra al mundo del Altiplano", "raro": false},
	"mente_abeja": {"nombre": "Mente de Abeja", "descripcion": "100% en un quiz sin pistas", "raro": true},
	"coleccionista": {"nombre": "Coleccionista", "descripcion": "Encuentra 3 panales de miel", "raro": false},
	"maestro_selva": {"nombre": "Maestro de la Selva", "descripcion": "Completa todos los modulos de la selva", "raro": true},
	"noche_buena": {"nombre": "Abeja Nocturna", "descripcion": "Juega despues de las 9pm", "raro": false},
	"velocista": {"nombre": "Velocista", "descripcion": "Completa un quiz en menos de 30 segundos", "raro": false}
}

var sesion_id: String = ""
var programa_tema: String = ""
var programa_objetivo: String = ""

const NIVELES = {
	1: {"nombre": "Abeja Huevo", "xp_req": 0},
	2: {"nombre": "Abeja Larva", "xp_req": 100},
	3: {"nombre": "Abeja Obrera", "xp_req": 300},
	4: {"nombre": "Abeja Exploradora", "xp_req": 700},
	5: {"nombre": "Abeja Guardiana", "xp_req": 1500},
	6: {"nombre": "Abeja Maestra", "xp_req": 3000},
	7: {"nombre": "Reina Aprendiz", "xp_req": 6000}
}

func _ready() -> void:
	print("[GameState] Inicializado - progreso sincronizado con backend")

func set_jugador(id: String, nick: String, av: String, edad: String, estilo: String = "visual") -> void:
	alumno_id = id
	nickname = nick
	avatar = av
	edad_rango = edad
	estilo_aprendizaje = estilo
	emit_signal("jugador_actualizado")
	print("[GameState] Jugador configurado: ", nickname)

func agregar_xp(cantidad: int) -> void:
	var xp_multiplicador = 1.0
	if racha >= 3:
		xp_multiplicador = 2.0
	
	var xp_ganado = int(cantidad * xp_multiplicador)
	xp_actual += xp_ganado
	total_xp_acumulado += xp_ganado
	
	_check_nivel()
	_verificar_logros()
	emit_signal("progreso_actualizado")
	print("[GameState] XP: ", xp_actual, " (+", xp_ganado, ") - sincronizado con backend")

func _check_nivel() -> void:
	var nuevo_nivel = 1
	for nivel in NIVELES:
		if xp_actual >= NIVELES[nivel]["xp_req"]:
			nuevo_nivel = nivel
	
	if nuevo_nivel != nivel_actual:
		nivel_actual = nuevo_nivel
		emit_signal("nivel_actualizado", nivel_actual)
		print("[GameState] Nuevo nivel: ", NIVELES[nivel_actual]["nombre"])

func perder_vida() -> void:
	vidas -= 1
	racha = 0
	emit_signal("progreso_actualizado")
	print("[GameState] Vidas: ", vidas)
	if vidas <= 0:
		_game_over()

func _game_over() -> void:
	print("[GameState] Game Over - reiniciando nivel")
	vidas = 3

func responder_correcto() -> void:
	racha += 1
	if racha > max_racha:
		max_racha = racha

func respuesta_incorrecta() -> void:
	racha = 0

func completar_modulo(modulo_id: String) -> void:
	if not modulo_id in modulos_completados:
		modulos_completados.append(modulo_id)
		print("[GameState] Modulo completado: ", modulo_id)
		_verificar_logros()

func _verificar_logros() -> void:
	if modulos_completados.size() >= 1:
		_desbloquear_logro("primera_chispa")
	if max_racha >= 10:
		_desbloquear_logro("racha_oro")
	if zonas_desbloqueadas.size() >= 2:
		_desbloquear_logro("explorador_andino")
	if preguntas_respondidas_voz >= 5:
		_desbloquear_logro("voz_selva")
	if modulos_completados.size() >= 4 and "selva" in modulos_completados[0]:
		_desbloquear_logro("maestro_selva")

func _desbloquear_logro(logro_id: String) -> void:
	if not logro_id in logros_desbloqueados and LOGROS.has(logro_id):
		logros_desbloqueados.append(logro_id)
		var nuevo_logro = {
			"id": logro_id,
			"nombre": LOGROS[logro_id]["nombre"],
			"descripcion": LOGROS[logro_id]["descripcion"],
			"raro": LOGROS[logro_id]["raro"],
			"fecha": Time.get_datetime_string_from_system()
		}
		logros.append(nuevo_logro)
		emit_signal("logro_desbloqueado", nuevo_logro)
		print("[GameState] Logro desbloqueado: ", LOGROS[logro_id]["nombre"])

func responder_por_voz() -> void:
	preguntas_respondidas_voz += 1
	_verificar_logros()

func verificar_zona(zona: int) -> bool:
	return zona in zonas_desbloqueadas

func desbloquear_zona(zona: int) -> void:
	if not zona in zonas_desbloqueadas:
		zonas_desbloqueadas.append(zona)
		emit_signal("zona_desbloqueada", zona)
		print("[GameState] Zona desbloqueada: ", zona)

func obtener_nivel_actual() -> Dictionary:
	return NIVELES.get(nivel_actual, {"nombre": "Desconocido", "xp_req": 0})

func xp_para_siguiente_nivel() -> int:
	var sig_nivel = nivel_actual + 1
	if NIVELES.has(sig_nivel):
		return NIVELES[sig_nivel]["xp_req"] - xp_actual
	return 0

func reiniciar() -> void:
	estado_actual = EstadoJuego.TITULO
	xp_actual = 0
	nivel_actual = 1
	vidas = 3
	racha = 0
	zonas_desbloqueadas = [1]
	modulos_completados = []
	emit_signal("progreso_actualizado")
	print("[GameState] Estado reiniciado")

func serializar() -> Dictionary:
	return {
		"alumno_id": alumno_id,
		"nickname": nickname,
		"avatar": avatar,
		"edad_rango": edad_rango,
		"estilo": estilo_aprendizaje,
		"xp": xp_actual,
		"nivel": nivel_actual,
		"vidas": vidas,
		"racha": racha,
		"max_racha": max_racha,
		"total_xp": total_xp_acumulado,
		"zonas": zonas_desbloqueadas,
		"modulos": modulos_completados,
		"logros": logros,
		"logros_desbloqueados": logros_desbloqueados,
		"preguntas_voz": preguntas_respondidas_voz
	}

func cargar(datos: Dictionary) -> void:
	if datos.has("alumno_id"):
		alumno_id = datos["alumno_id"]
	if datos.has("nickname"):
		nickname = datos["nickname"]
	if datos.has("avatar"):
		avatar = datos["avatar"]
	if datos.has("edad_rango"):
		edad_rango = datos["edad_rango"]
	if datos.has("estilo"):
		estilo_aprendizaje = datos["estilo"]
	if datos.has("xp"):
		xp_actual = datos["xp"]
	if datos.has("nivel"):
		nivel_actual = datos["nivel"]
	if datos.has("vidas"):
		vidas = datos["vidas"]
	if datos.has("racha"):
		racha = datos["racha"]
	if datos.has("max_racha"):
		max_racha = datos["max_racha"]
	if datos.has("total_xp"):
		total_xp_acumulado = datos["total_xp"]
	if datos.has("zonas"):
		zonas_desbloqueadas = datos["zonas"]
	if datos.has("modulos"):
		modulos_completados = datos["modulos"]
	if datos.has("logros"):
		logros = datos["logros"]
	if datos.has("logros_desbloqueados"):
		logros_desbloqueados = datos["logros_desbloqueados"]
	if datos.has("preguntas_voz"):
		preguntas_respondidas_voz = datos["preguntas_voz"]
	
	emit_signal("progreso_actualizado")
	print("[GameState] Progreso cargado para: ", nickname)

func obtener_logros_disponibles() -> Array:
	var disponibles = []
	for key in LOGROS:
		if not key in logros_desbloqueados:
			var logro = LOGROS[key].duplicate()
			logro["id"] = key
			disponibles.append(logro)
	return disponibles