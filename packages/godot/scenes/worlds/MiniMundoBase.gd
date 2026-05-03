extends Node2D

@export var nombre_zona: String = "Mini-Mundo"
@export var agente: String = "Agente"
@export var color_fondo: Color = Color(0.1, 0.1, 0.1, 1)

var modulo_actual: String = ""

func _ready() -> void:
	if has_node("Background"):
		$Background.color = color_fondo
	if has_node("AgenteLabel"):
		$AgenteLabel.text = agente
	if has_node("Titulo"):
		$Titulo.text = nombre_zona
	_mostrar_bienvenida()

func _mostrar_bienvenida() -> void:
	if has_node("Dialogo"):
		$Dialogo/Label.text = "¡Bienvenido a " + nombre_zona + "! Soy " + agente + ". Este mundo aún está en construcción."
		$Dialogo.visible = true

func _on_volver_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/hub/LaGranColmena.tscn")