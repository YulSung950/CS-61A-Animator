//// The drawings that a browser with no saved library starts with: each one's
//// name and source.

pub const all = [
  #(
    "fan",
    "fn draw(shape_slider: Int) -> List(Path) {
  fan(30, Point(-200, -200))
}

fn fan(n: Int, start: Point) -> List(Path) {
  case n > 0 {
    True -> [Path(Line(start, Point(n * 10, 200)), 0, 30, 3), ..fan(n - 1, start)]
    False -> []
  }
}
",
  ),
  #(
    "square_spiral",
    "fn draw(shape_slider: Int) -> List(Path) {
  let turns = 20 + shape_slider / 4
  spiral(Point(0, 0), Point(1, 0), 0, turns)
}

fn spiral(p: Point, d: Point, i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let len = { i / 2 + 1 } * 24
      let q = Point(p.x + d.x * len, p.y + d.y * len)
      [
        Path(Line(p, q), i * 3, i * 3 + 3, 3),
        ..spiral(q, Point(0 - d.y, d.x), i + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "circle_spiral",
    "fn draw(shape_slider: Int) -> List(Path) {
  let steps = 90 + shape_slider
  circle_spiral(Point(0, 0), Point(48, 0), 0, steps)
}

fn circle_spiral(p: Point, d: Point, i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let q = Point(p.x + d.x / 6, p.y + d.y / 6)
      // Soft integer rotate (~atan(1/10)) plus slight growth → Archimedean spiral.
      let rx = d.x - d.y / 10
      let ry = d.y + d.x / 10
      let nd = Point(rx + rx / 80, ry + ry / 80)
      [
        Path(Line(p, q), i / 2, i / 2 + 2, 2),
        ..circle_spiral(q, nd, i + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "string_art",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 8 + shape_slider / 10
  list.flatten([
    quadrant(1, 1, n, 0),
    quadrant(-1, 1, n, n + 1),
    quadrant(-1, -1, n, { n + 1 } * 2),
    quadrant(1, -1, n, { n + 1 } * 3),
  ])
}

fn quadrant(sx: Int, sy: Int, n: Int, base: Int) -> List(Path) {
  strings(0, sx, sy, n, base)
}

fn strings(i: Int, sx: Int, sy: Int, n: Int, base: Int) -> List(Path) {
  case i > n {
    True -> []
    False -> {
      let a = Point(sx * 420 * i / n, 0)
      let b = Point(0, sy * 420 * { n - i } / n)
      let t = { base + i } * 2
      [Path(Line(a, b), t, t + 8, 2), ..strings(i + 1, sx, sy, n, base)]
    }
  }
}
",
  ),
  #(
    "tree",
    "fn draw(shape_slider: Int) -> List(Path) {
  let depth = 4 + shape_slider / 20
  branch(Point(0, 420), Point(0, -220), 0, depth)
}

fn branch(p: Point, d: Point, level: Int, depth: Int) -> List(Path) {
  case level == depth {
    True -> []
    False -> {
      let q = Point(p.x + d.x, p.y + d.y)
      let left = Point({ d.x - d.y } / 2, { d.y + d.x } / 2)
      let right = Point({ d.x + d.y } / 2, { d.y - d.x } / 2)
      [
        Path(Line(p, q), level * 4, level * 4 + 4, depth - level),
        ..list.append(
          branch(q, left, level + 1, depth),
          branch(q, right, level + 1, depth),
        )
      ]
    }
  }
}
",
  ),
  #(
    "house",
    "fn draw(shape_slider: Int) -> List(Path) {
  list.flatten([
    [
      Path(Line(Point(-160, 40), Point(160, 40)), 0, 4, 4),
      Path(Line(Point(160, 40), Point(160, 320)), 4, 8, 4),
      Path(Line(Point(160, 320), Point(-160, 320)), 8, 12, 4),
      Path(Line(Point(-160, 320), Point(-160, 40)), 12, 16, 4),
    ],
    [
      Path(Line(Point(-160, 40), Point(0, -200)), 16, 24, 4),
      Path(Line(Point(0, -200), Point(160, 40)), 24, 32, 4),
    ],
  ])
}
",
  ),
  #(
    "grid_8x8",
    "fn draw(shape_slider: Int) -> List(Path) {
  list.append(h_lines(0), v_lines(0))
}

fn h_lines(i: Int) -> List(Path) {
  case i > 8 {
    True -> []
    False -> {
      let y = -200 + i * 50
      [
        Path(Line(Point(-200, y), Point(200, y)), i * 2, i * 2 + 3, 2),
        ..h_lines(i + 1)
      ]
    }
  }
}

fn v_lines(i: Int) -> List(Path) {
  case i > 8 {
    True -> []
    False -> {
      let x = -200 + i * 50
      [
        Path(Line(Point(x, -200), Point(x, 200)), 20 + i * 2, 20 + i * 2 + 3, 2),
        ..v_lines(i + 1)
      ]
    }
  }
}
",
  ),
  #(
    "circle_x",
    "fn draw(shape_slider: Int) -> List(Path) {
  // No Circle shape in the language — approximate with Path/Line chords.
  list.append(
    ring(Point(240, 0), Point(0, 40), 0, 40),
    [
      Path(Line(Point(-170, -170), Point(170, 170)), 42, 52, 3),
      Path(Line(Point(-170, 170), Point(170, -170)), 52, 62, 3),
    ],
  )
}

fn ring(p: Point, d: Point, i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let q = Point(p.x + d.x / 6, p.y + d.y / 6)
      let nd = Point(d.x - d.y / 10, d.y + d.x / 10)
      [
        Path(Line(p, q), i / 2, i / 2 + 2, 3),
        ..ring(q, nd, i + 1, n)
      ]
    }
  }
}
",
  ),
]
