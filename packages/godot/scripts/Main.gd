extends Node2D

var current_scene: Node = null
var scene_path: Dictionary = {
	"title": "res://scenes/title/TitleScreen.tscn",
	"onboarding": "res://scenes/onboarding/Onboarding.tscn",
	"hub": "res://scenes/hub/LaGranColmena.tscn"
}

func _ready() -> void:
	print("[Main] Iniciando HiveLearn: La Gran Colmena")
	cargar_escena("title")

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		pass

func cargar_escena(nombre: String) -> void:
	if not scene_path.has(nombre):
		print("[Main] Escena no encontrada: ", nombre)
		return
	
	var path = scene_path[nombre]
	print("[Main] Cargando escena: ", path)
	
	var nueva_escena = load(path)
	if nueva_escena:
		if current_scene:
			current_scene.queue_free()
		
		var instancia = nueva_escena.instantiate()
		$CanvasLayer/CurrentScene.add_child(instancia)
		current_scene = instancia
		
		if instancia.has_signal("escena_finalizada"):
			instancia.connect("escena_finalizada", _on_escena_finalizada)
	else:
		print("[Main] Error al cargar: ", path)

func _on_escena_finalizada(nombre_siguiente: String) -> void:
	cargar_escena(nombre_siguiente)

func transicion_fade(duracion: float = 0.5) -> void:
	var transition = $UI/Transition
	transition.visible = true
	transition.modulate.a = 0.0
	
	var tween = create_tween()
	tween.tween_property(transition, "modulate:a", 1.0, duracion / 2.0)
	tween.tween_callback(func():
		pass
	).tween_property(transition, "modulate:a", 0.0, duracion / 2.0)
	tween.tween_callback(func():
		transition.visible = false
	)