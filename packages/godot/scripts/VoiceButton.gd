extends Button

signal comando_voz(comando: Dictionary)

var mic_activo: bool = false

@onready var icono_normal = "🎤"
@onready var icono_activo = "🔊"
@onready var icono_procesando = "⏳"

func _ready() -> void:
	text = icono_normal + " Voz"
	pressed.connect(_on_pressed)
	VoiceInput.connect("voz_recibida", _on_voz_recibida)
	VoiceInput.connect("estado_cambiado", _on_estado_cambiado)

func _on_pressed() -> void:
	if not mic_activo:
		VoiceInput.iniciar_escucha()
	else:
		VoiceInput.detener_escucha()

func _on_voz_recibida(texto: String) -> void:
	mic_activo = false
	text = icono_normal + " Voz"
	
	if VoiceInput.verificar_comando_valido(texto):
		var comando = VoiceInput.obtener_comando_accion(texto)
		emit_signal("comando_voz", comando)
		print("[VoiceButton] Comando válido: ", texto)
	else:
		var numero = VoiceInput.obtener_opcion_numerica(texto)
		if numero > 0:
			emit_signal("comando_voz", {"accion": "opcion", "valor": numero, "texto": texto})
			print("[VoiceButton] Opción numérica: ", numero)
		else:
			comando_voz.emit({"accion": "desconocido", "texto": texto})
			print("[VoiceButton] Comando desconocido: ", texto)

func _on_estado_cambiado(estado: String) -> void:
	match estado:
		"escuchando":
			mic_activo = true
			text = icono_activo + " Escuchando..."
		"procesando":
			text = icono_procesando + " Procesando..."
		"inactivo":
			mic_activo = false
			text = icono_normal + " Voz"

func _exit_tree() -> void:
	if mic_activo:
		VoiceInput.detener_escucha()