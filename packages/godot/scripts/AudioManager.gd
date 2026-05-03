extends Node

signal reproduccion_iniciada()
signal reproduccion_terminada()

var audio_stream_player: AudioStreamPlayer
var audio_stream_generator: AudioStreamGenerator
var audio_stream_generator_play: AudioStreamGeneratorPlayback
var audio_queue: Array[PackedByteArray] = []
var is_playing: bool = false

const SAMPLE_RATE = 22050
const CHANNELS = 1

func _ready() -> void:
	audio_stream_player = AudioStreamPlayer.new()
	add_child(audio_stream_player)
	
	audio_stream_generator = AudioStreamGenerator.new()
	audio_stream_generator.mix_rate = SAMPLE_RATE
	audio_stream_generator.buffer_length = 0.5
	audio_stream_player.stream = audio_stream_generator
	audio_stream_player.play()
	audio_stream_generator_play = audio_stream_player.get_playback()
	
	print("[AudioManager] Inicializado - Sample rate: ", SAMPLE_RATE)

func reproducir_tts(audio_pcm: PackedByteArray) -> void:
	if audio_pcm.size() == 0:
		return
	
	print("[AudioManager] Reproduciendo audio TTS, tamanho: ", audio_pcm.size())
	
	var stream = AudioStreamMicrophone.new()
	stream.format = AudioStreamMicrophone.FORMAT_IMA_ADPCM
	stream.mix_rate = SAMPLE_RATE
	
	emit_signal("reproduccion_iniciada")
	_process_pcm_audio(audio_pcm)

func _process_pcm_audio(pcm_data: PackedByteArray) -> void:
	var samples = _pcm_to_samples(pcm_data)
	if samples.size() > 0:
		audio_stream_generator_play.push_samples(samples)
		emit_signal("reproduccion_terminada")

func _pcm_to_samples(pcm_data: PackedByteArray) -> PackedVector2Array:
	var samples = PackedVector2Array()
	samples.resize(pcm_data.size() / 2)
	
	for i in range(0, pcm_data.size() - 1, 2):
		if i + 1 < pcm_data.size():
			var sample = pcm_data[i] | (pcm_data[i + 1] << 8)
			if sample > 32767:
				sample -= 65536
			var normalized = float(sample) / 32768.0
			samples[i / 2] = Vector2(normalized, normalized)
	
	return samples

func esta_reproduciendo() -> bool:
	return audio_stream_player.playing

func detener() -> void:
	audio_stream_player.stop()
	audio_stream_generator_play.flush()
	print("[AudioManager] Reproduccion detenida")

func reproducir_sfx(sfx_path: String) -> void:
	if FileAccess.file_exists(sfx_path):
		var stream = AudioStreamWAV.new()
		stream.file_path = sfx_path
		audio_stream_player.stream = stream
		audio_stream_player.play()
	else:
		print("[AudioManager] SFX no encontrado: ", sfx_path)

func iniciar_captura_voz() -> void:
	print("[AudioManager] Iniciando captura de voz...")
	# AudioEffectCapture necesita implementarse en la escena
	# por limitaciones de Godot en headless
	pass

func get_audio_capture() -> AudioStreamGenerator:
	return audio_stream_generator