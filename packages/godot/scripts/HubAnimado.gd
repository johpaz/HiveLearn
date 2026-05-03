extends Node2D

var tiempo: float = 0.0
var hex_centro: Polygon2D
var botones: Array = []

const RADIO_HEX = 90.0

func _ready() -> void:
	hex_centro = $HexCentro
	_dibujar_colmena()
	_obtener_botones()

func _dibujar_colmena() -> void:
	# Hexágono central grande
	var puntos = _generar_hexagono(RADIO_HEX)
	hex_centro.polygon = puntos
	
	# Anillo de hexágonos más pequeños
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		var pos = Vector2(cos(angulo), sin(angulo)) * RADIO_HEX * 1.3
		
		var hex_chico = Polygon2D.new()
		hex_chico.polygon = _generar_hexagono(RADIO_HEX * 0.7)
		hex_chico.position = pos
		hex_chico.color = Color(0.85, 0.65, 0.1, 0.8)
		hex_chico.name = "HexRing_" + str(i)
		$HexCapa1.add_child(hex_chico)

func _generar_hexagono(radio: float) -> PackedVector2Array:
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = deg_to_rad(60 * i - 30)
		puntos.append(Vector2(cos(angulo), sin(angulo)) * radio)
	return puntos

func _obtener_botones() -> void:
	for child in $HexCapa1.get_children():
		if child is Button:
			botones.append(child)

func _process(delta: float) -> void:
	tiempo += delta
	
	# Animación de respiración del centro
	var escala = 1.0 + sin(tiempo * 2) * 0.02
	hex_centro.scale = Vector2(escala, escala)
	
	# Rotación sutil de los anillos
	var i = 0
	for child in $HexCapa1.get_children():
		if child is Polygon2D:
			child.rotation = sin(tiempo + i * 0.5) * 0.03
			i += 1
	
	# Animación de los botones
	for btn in botones:
		if not btn.disabled:
			btn.modulate = Color(1, 1, 1, 0.9 + sin(tiempo * 3) * 0.1)

func actualizar_zonas(zonas_desbloqueadas: Array) -> void:
	var zonas = {
		1: {"nombre": "Selva Amazónica", "color": Color(0.2, 0.6, 0.3)},
		2: {"nombre": "Altiplano Andino", "color": Color(0.5, 0.5, 0.6)},
		3: {"nombre": "Cenotes Mayas", "color": Color(0.2, 0.5, 0.7)},
		4: {"nombre": "Ciudad LATAM 2150", "color": Color(0.6, 0.3, 0.7)},
		5: {"nombre": "Pampa/Llanos", "color": Color(0.8, 0.6, 0.3)},
		6: {"nombre": "Galaxia Antarés", "color": Color(0.3, 0.3, 0.5)}
	}
	
	var map_zonas = {
		1: $HexCapa1/Zona1,
		2: $HexCapa1/Zona2,
		3: $HexCapa1/Zona3,
		4: $HexCapa1/Zona4,
		5: $HexCapa1/Zona5,
		6: $HexCapa1/Zona6
	}
	
	for zona_id in map_zonas:
		var btn = map_zonas[zona_id]
		if zona_id in zonas_desbloqueadas:
			btn.disabled = false
			btn.text = zonas[zona_id]["nombre"]
			btn.modulate = Color(1, 1, 1, 1)
		else:
			btn.disabled = true
			btn.text = "🔒"
			btn.modulate = Color(0.5, 0.5, 0.5, 1)

func animacion_desbloqueo(zona_id: int) -> void:
	var map_zonas = {
		1: $HexCapa1/Zona1,
		2: $HexCapa1/Zona2,
		3: $HexCapa1/Zona3,
		4: $HexCapa1/Zona4,
		5: $HexCapa1/Zona5,
		6: $HexCapa1/Zona6
	}
	
	if map_zonas.has(zona_id):
		var btn = map_zonas[zona_id]
		var tween = create_tween()
		tween.tween_property(btn, "scale", Vector2(1.5, 1.5), 0.2)
		tween.tween_property(btn, "modulate:a", 1.0, 0.2)
		tween.tween_property(btn, "scale", Vector2(1.0, 1.0), 0.3).set_ease(Tween.EASE_OUT)