extends Node2D

var tiempo: float = 0.0
var hex_grande: Polygon2D
var hex_medio: Polygon2D
var hex_chico: Polygon2D
var centro: Polygon2D

func _ready() -> void:
	hex_grande = $HexagonoGrande
	hex_medio = $HexagonoMedio
	hex_chico = $HexagonoChico
	centro = $Centro
	_dibujar_hexagonos()

func _draw() -> void:
	pass

func _dibujar_hexagonos() -> void:
	var radio = 80.0
	var puntos = _generar_hexagono(radio)
	hex_grande.polygon = puntos
	
	puntos = _generar_hexagono(radio * 0.7)
	hex_medio.polygon = puntos
	
	puntos = _generar_hexagono(radio * 0.4)
	hex_chico.polygon = puntos
	
	puntos = _generar_hexagono(radio * 0.2)
	centro.polygon = puntos

func _generar_hexagono(radio: float) -> PackedVector2Array:
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos.append(Vector2(cos(angulo), sin(angulo)) * radio)
	return puntos

func _process(delta: float) -> void:
	tiempo += delta
	
	# Animación de respiración
	var escala_base = 1.0
	var escala_pulso = sin(tiempo * 1.5) * 0.03
	
	hex_grande.scale = Vector2(escala_base + escala_pulso, escala_base + escala_pulso)
	hex_medio.scale = Vector2(escala_base - escala_pulso, escala_base - escala_pulso)
	hex_chico.scale = Vector2(escala_base + escala_pulso * 1.5, escala_base + escala_pulso * 1.5)
	
	# Rotación sutil
	hex_grande.rotation = sin(tiempo * 0.5) * 0.02
	hex_medio.rotation = -sin(tiempo * 0.7) * 0.03
	
	# Centro pulsa
	centro.scale = Vector2(0.2 + sin(tiempo * 3) * 0.02, 0.2 + sin(tiempo * 3) * 0.02)