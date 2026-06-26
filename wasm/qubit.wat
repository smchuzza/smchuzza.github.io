;; 1-qubit pure-state simulator: |ψ⟩ = α|0⟩ + β|1⟩
;; Memory: 0..31 amplitudes (f64×4), 32 last measurement (i32)

(module
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "cos" (func $cos (param f64) (result f64)))

  (memory (export "memory") 1)

  (global $alpha_re (mut f64) (f64.const 1))
  (global $alpha_im (mut f64) (f64.const 0))
  (global $beta_re  (mut f64) (f64.const 0))
  (global $beta_im  (mut f64) (f64.const 0))
  (global $rng      (mut i32) (i32.const 2463534242))

  (func $write_mem
    (f64.store (i32.const 0) (global.get $alpha_re))
    (f64.store (i32.const 8) (global.get $alpha_im))
    (f64.store (i32.const 16) (global.get $beta_re))
    (f64.store (i32.const 24) (global.get $beta_im))
  )

  (func $renorm
    (local $n f64)
    (local.set $n
      (f64.sqrt
        (f64.add
          (f64.add
            (f64.mul (global.get $alpha_re) (global.get $alpha_re))
            (f64.mul (global.get $alpha_im) (global.get $alpha_im)))
          (f64.add
            (f64.mul (global.get $beta_re) (global.get $beta_re))
            (f64.mul (global.get $beta_im) (global.get $beta_im))))))
    (if (f64.gt (local.get $n) (f64.const 1e-15))
      (then
        (global.set $alpha_re (f64.div (global.get $alpha_re) (local.get $n)))
        (global.set $alpha_im (f64.div (global.get $alpha_im) (local.get $n)))
        (global.set $beta_re  (f64.div (global.get $beta_re)  (local.get $n)))
        (global.set $beta_im  (f64.div (global.get $beta_im)  (local.get $n)))
      )
    )
    (call $write_mem)
  )

  (func $cmul (param $ar f64) (param $ai f64) (param $br f64) (param $bi f64) (result f64 f64)
    (f64.sub (f64.mul (local.get $ar) (local.get $br)) (f64.mul (local.get $ai) (local.get $bi)))
    (f64.add (f64.mul (local.get $ar) (local.get $bi)) (f64.mul (local.get $ai) (local.get $br)))
  )

  (func $cadd (param $ar f64) (param $ai f64) (param $br f64) (param $bi f64) (result f64 f64)
    (f64.add (local.get $ar) (local.get $br))
    (f64.add (local.get $ai) (local.get $bi))
  )

  (func $apply_u
    (param $u00r f64) (param $u00i f64) (param $u01r f64) (param $u01i f64)
    (param $u10r f64) (param $u10i f64) (param $u11r f64) (param $u11i f64)
    (local $ar f64) (local $ai f64) (local $br f64) (local $bi f64)
    (local $t0r f64) (local $t0i f64) (local $t1r f64) (local $t1i f64)
    (local $nar f64) (local $nai f64) (local $nbr f64) (local $nbi f64)

    (local.set $ar (global.get $alpha_re))
    (local.set $ai (global.get $alpha_im))
    (local.set $br (global.get $beta_re))
    (local.set $bi (global.get $beta_im))

    (call $cmul (local.get $u00r) (local.get $u00i) (local.get $ar) (local.get $ai))
    (local.set $t0i)
    (local.set $t0r)
    (call $cmul (local.get $u01r) (local.get $u01i) (local.get $br) (local.get $bi))
    (local.set $t1i)
    (local.set $t1r)
    (call $cadd (local.get $t0r) (local.get $t0i) (local.get $t1r) (local.get $t1i))
    (local.set $nai)
    (local.set $nar)

    (call $cmul (local.get $u10r) (local.get $u10i) (local.get $ar) (local.get $ai))
    (local.set $t0i)
    (local.set $t0r)
    (call $cmul (local.get $u11r) (local.get $u11i) (local.get $br) (local.get $bi))
    (local.set $t1i)
    (local.set $t1r)
    (call $cadd (local.get $t0r) (local.get $t0i) (local.get $t1r) (local.get $t1i))
    (local.set $nbi)
    (local.set $nbr)

    (global.set $alpha_re (local.get $nar))
    (global.set $alpha_im (local.get $nai))
    (global.set $beta_re  (local.get $nbr))
    (global.set $beta_im  (local.get $nbi))
    (call $renorm)
  )

  (func (export "reset")
    (global.set $alpha_re (f64.const 1))
    (global.set $alpha_im (f64.const 0))
    (global.set $beta_re  (f64.const 0))
    (global.set $beta_im  (f64.const 0))
    (call $write_mem)
  )

  (func (export "apply_h")
    (local $s f64)
    (local.set $s (f64.div (f64.const 1) (f64.sqrt (f64.const 2))))
    (call $apply_u
      (local.get $s) (f64.const 0) (local.get $s) (f64.const 0)
      (local.get $s) (f64.const 0) (f64.neg (local.get $s)) (f64.const 0))
  )

  (func (export "apply_x")
    (call $apply_u
      (f64.const 0) (f64.const 0) (f64.const 1) (f64.const 0)
      (f64.const 1) (f64.const 0) (f64.const 0) (f64.const 0))
  )

  (func (export "apply_y")
    (call $apply_u
      (f64.const 0) (f64.const 0) (f64.const 0) (f64.const -1)
      (f64.const 0) (f64.const 1) (f64.const 0) (f64.const 0))
  )

  (func (export "apply_z")
    (call $apply_u
      (f64.const 1) (f64.const 0) (f64.const 0) (f64.const 0)
      (f64.const 0) (f64.const 0) (f64.const -1) (f64.const 0))
  )

  (func (export "apply_rx") (param $theta f64)
    (local $c f64) (local $s f64)
    (local.set $c (call $cos (f64.div (local.get $theta) (f64.const 2))))
    (local.set $s (call $sin (f64.div (local.get $theta) (f64.const -2))))
    (call $apply_u
      (local.get $c) (f64.const 0) (f64.const 0) (local.get $s)
      (f64.const 0) (f64.neg (local.get $s)) (local.get $c) (f64.const 0))
  )

  (func (export "apply_ry") (param $theta f64)
    (local $c f64) (local $s f64)
    (local.set $c (call $cos (f64.div (local.get $theta) (f64.const 2))))
    (local.set $s (call $sin (f64.div (local.get $theta) (f64.const 2))))
    (call $apply_u
      (local.get $c) (f64.const 0) (f64.neg (local.get $s)) (f64.const 0)
      (local.get $s) (f64.const 0) (local.get $c) (f64.const 0))
  )

  (func (export "apply_rz") (param $theta f64)
    (local $c f64) (local $s f64)
    (local.set $c (call $cos (f64.div (local.get $theta) (f64.const 2))))
    (local.set $s (call $sin (f64.div (local.get $theta) (f64.const 2))))
    (call $apply_u
      (local.get $c) (f64.neg (local.get $s)) (f64.const 0) (f64.const 0)
      (f64.const 0) (f64.const 0) (local.get $c) (local.get $s))
  )

  (func $rand01 (result f64)
    (local $x i32)
    (local.set $x (global.get $rng))
    (local.set $x (i32.xor (local.get $x) (i32.shl (local.get $x) (i32.const 13))))
    (local.set $x (i32.xor (local.get $x) (i32.shr_u (local.get $x) (i32.const 17))))
    (local.set $x (i32.xor (local.get $x) (i32.shl (local.get $x) (i32.const 5))))
    (global.set $rng (local.get $x))
    (f64.div
      (f64.convert_i32_u (i32.and (local.get $x) (i32.const 2147483647)))
      (f64.const 2147483647))
  )

  (func (export "measure") (result i32)
    (local $p0 f64) (local $r f64) (local $out i32)
    (local.set $p0
      (f64.add
        (f64.mul (global.get $alpha_re) (global.get $alpha_re))
        (f64.mul (global.get $alpha_im) (global.get $alpha_im))))
    (local.set $r (call $rand01))
    (if (f64.lt (local.get $r) (local.get $p0))
      (then
        (local.set $out (i32.const 0))
        (global.set $alpha_re (f64.const 1))
        (global.set $alpha_im (f64.const 0))
        (global.set $beta_re  (f64.const 0))
        (global.set $beta_im  (f64.const 0))
      )
      (else
        (local.set $out (i32.const 1))
        (global.set $alpha_re (f64.const 0))
        (global.set $alpha_im (f64.const 0))
        (global.set $beta_re  (f64.const 1))
        (global.set $beta_im  (f64.const 0))
      )
    )
    (call $write_mem)
    (i32.store (i32.const 32) (local.get $out))
    (local.get $out)
  )

  (func (export "prob0") (result f64)
    (f64.add
      (f64.mul (global.get $alpha_re) (global.get $alpha_re))
      (f64.mul (global.get $alpha_im) (global.get $alpha_im)))
  )

  (func (export "bloch_x") (result f64)
    (f64.mul (f64.const 2)
      (f64.add
        (f64.mul (global.get $alpha_re) (global.get $beta_re))
        (f64.mul (global.get $alpha_im) (global.get $beta_im))))
  )

  (func (export "bloch_y") (result f64)
    (f64.mul (f64.const 2)
      (f64.sub
        (f64.mul (global.get $alpha_im) (global.get $beta_re))
        (f64.mul (global.get $alpha_re) (global.get $beta_im))))
  )

  (func (export "bloch_z") (result f64)
    (f64.sub
      (f64.add
        (f64.mul (global.get $alpha_re) (global.get $alpha_re))
        (f64.mul (global.get $alpha_im) (global.get $alpha_im)))
      (f64.add
        (f64.mul (global.get $beta_re) (global.get $beta_re))
        (f64.mul (global.get $beta_im) (global.get $beta_im))))
  )

  (func (export "sync_state") (call $write_mem))
)
