extends Node

signal reproduccion_iniciada()
signal reproduccion_terminada()
signal captura_voz_iniciada()
signal captura_voz_terminada(audio_data: PackedByteArray)

var audio_stream_player: AudioStreamPlayer
var audio_stream_player_sfx: AudioStreamPlayer

const SAMPLE_RATE = 22050

func _ready() -> void:
	audio_stream_player = AudioStreamPlayer.new()
	audio_stream_player.bus = "Master"
	add_child(audio_stream_player)
	
	audio_stream_player_sfx = AudioStreamPlayer.new()
	audio_stream_player_sfx.bus = "Master"
	add_child(audio_stream_player_sfx)
	
	print("[AudioManager] Inicializado")

func reproducir_tts(audio_pcm: PackedByteArray) -> void:
	if audio_pcm.size() == 0:
		return
	
	print("[AudioManager] Reproduciendo TTS: ", audio_pcm.size(), " bytes")
	emit_signal("reproduccion_iniciada")
	
	if _es_audio_wav(audio_pcm):
		_reproducir_wav_directo(audio_pcm)
	else:
		_reproducir_pcm(audio_pcm)

func _es_audio_wav(data: PackedByteArray) -> bool:
	if data.size() < 44:
		return false
	var header = data.slice(0, 4).get_string_from_utf8()
	return header == "RIFF"

func _reproducir_wav_directo(data: PackedByteArray) -> void:
	var stream = AudioStreamWAV.new()
	stream.data = data.slice(44)
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	
	audio_stream_player.stream = stream
	audio_stream_player.play()
	
	await get_tree().create_timer(float(stream.data.size()) / 2.0 / float(SAMPLE_RATE)).timeout
	emit_signal("reproduccion_terminada")

func _reproducir_pcm(pcm_data: PackedByteArray) -> void:
	var stream = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	
	var datos_16bits = _convertir_pcm_a_16bits(pcm_data)
	stream.data = datos_16bits
	
	audio_stream_player.stream = stream
	audio_stream_player.play()
	
	var duracion = float(datos_16bits.size()) / 2.0 / float(SAMPLE_RATE)
	await get_tree().create_timer(duracion).timeout
	emit_signal("reproduccion_terminada")

func _convertir_pcm_a_16bits(pcm: PackedByteArray) -> PackedByteArray:
	var resultado = PackedByteArray()
	resultado.resize(pcm.size() * 2)
	
	for i in range(pcm.size()):
		var sample = pcm[i]
		if sample > 127:
			sample -= 256
		var valor_16 = sample * 256
		resultado[i * 2] = valor_16 & 0xFF
		resultado[i * 2 + 1] = (valor_16 >> 8) & 0xFF
	
	return resultado

func reproducir_tts_base64(audio_base64: String) -> void:
	var datos = Marshalls.base64_to_raw(audio_base64)
	if datos.size() > 0:
		reproducir_tts(datos)

func esta_reproduciendo() -> bool:
	return audio_stream_player.playing

func detener() -> void:
	audio_stream_player.stop()
	audio_stream_player_sfx.stop()
	print("[AudioManager] Detenido")

func reproducir_sfx(sfx_path: String) -> void:
	if FileAccess.file_exists(sfx_path):
		var stream = AudioStreamWAV.new()
		stream.file_path = sfx_path
		audio_stream_player_sfx.stream = stream
		audio_stream_player_sfx.play()
	else:
		print("[AudioManager] SFX no encontrado: ", sfx_path)

func iniciar_captura_voz() -> void:
	print("[AudioManager] Captura de voz - enviando peticion al backend")
	emit_signal("captura_voz_iniciada")

func procesar_audio_capturado(audio_data: PackedByteArray) -> void:
	emit_signal("captura_voz_terminada", audio_data)

func obtener_stream_generator() -> AudioStreamPlayer:
	return audio_stream_player