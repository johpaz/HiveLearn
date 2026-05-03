extends Node2D

@export var color: Color = Color(1, 0.85, 0.2, 0.8)
@export var velocidad: float = 50.0
@export var rotacion_velocidad: float = 30.0
@export var tiempo_vida: float = 3.0
@export var escala_min: float = 0.3
@export var escala_max: float = 1.0
@export var cantidad_inicial: int = 30
@export var radio_origen: float = 100.0
@export var radio_destino: float = 400.0

var hexagons: Array = []
var tiempo: float = 0.0

class HexParticula:
	var posicion: Vector2
	var velocidad: Vector2
	var rotacion: float
	var rotacion_vel: float
	var escala: float
	var alpha: float
	var vida: float
	var vida_max: float

func _ready() -> void:
	generar_hexagonos_iniciales()

func generar_hexagonos_iniciales() -> void:
	for i in range(cantidad_inicial):
		crear_hexagono(true)

func crear_hexagono(aleatorio: bool = false) -> void:
	var hex = HexParticula.new()
	
	if aleatorio:
		hex.posicion = Vector2(randf_range(-radio_origen, radio_origen), randf_range(-radio_origen, radio_origen)).rotated(randf() * TAU)
		hex.vida = randf() * tiempo_vida
	else:
		hex.posicion = Vector2.ZERO
		hex.vida = 0.0
	
	hex.vida_max = tiempo_vida
	hex.rotacion = randf() * TAU
	hex.rotacion_vel = randf_range(-rotacion_velocidad, rotacion_velocidad) * deg_to_rad(1)
	hex.escala = randf_range(escala_min, escala_max)
	hex.alpha = 1.0
	
	var direccion = hex.posicion.normalized() if hex.posicion.length() > 0 else Vector2.UP.rotated(randf() * TAU)
	hex.velocidad = direccion * velocidad * randf_range(0.5, 1.5)
	
	hexagons.append(hex)

func _process(delta: float) -> void:
	tiempo += delta
	queue_redraw()
	actualizar_hexagonos(delta)
	
	if randf() < 0.05:
		crear_hexagono()

func actualizar_hexagonos(delta: float) -> void:
	for hex in hexagons:
		hex.posicion += hex.velocidad * delta
		hex.rotacion += hex.rotacion_vel * delta
		hex.vida += delta
		
		var progreso = hex.vida / hex.vida_max
		if progreso < 0.2:
			hex.alpha = progreso / 0.2
		elif progreso > 0.8:
			hex.alpha = (1.0 - progreso) / 0.2
		else:
			hex.alpha = 1.0
	
	hexagons = hexagons.filter(func(h): return h.vida < h.vida_max)

func _draw() -> void:
	for hex in hexagons:
		var c = Color(color.r, color.g, color.b, color.a * hex.alpha)
		dibujar_hexagono(hex.posicion, hex.escala * 20, hex.rotacion, c)

func dibujar_hexagono(pos: Vector2, radio: float, rot: float, c: Color) -> void:
	var puntos = PackedVector2Array()
	for i in range(6):
		var angulo = rot + deg_to_rad(60 * i - 30)
		puntos.append(pos + Vector2(cos(angulo), sin(angulo)) * radio)
	draw_polygon(puntos, PackedColorArray([c]))