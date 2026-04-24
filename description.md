# hexgame

hexgame is a working title, and hopefully this will end up being a family of games.

The idea is that triangles are moved by pivoting a point between 6 of them that rotates
them in a hexagon. Maybe players can convert triangles by surrounding them by enough
other triangles of the player's colour? And you can only rotate when a triangle of
your colour is next to it? I guess the aim is to conquer the board, or get some percentage
or wipe out the other player(s). Some experimenting required for the mechanic.

Maybe there are some special things on triangles that appear that give you a special power?

Maybe there's a solitair version where you match colours to remove them and new random ones appear?

The "grid" would be a bunch of equilateral triangles arranged such that any point on a trangle
vertex is also on 5 other trangle's vertices so they form a hexagon.

```

Equilateral triangle:

   o
  / \
 o---o

Inverted equilateral triangle:

 o---o
  \ /
   o

Hexagon of trangles:

  o---o
 / \ / \
o---0---o
 \ / \ /
  o---o

They could rotate around the 0:

  o---o         o---o         o---o         o---o         o---o         o---o
 /f\a/b\       /e\f/a\       /d\e/f\       /c\d/e\       /b\c/d\       /a\b/c\
o---0---o <=> o---0---o <=> o---0---o <=> o---0---o <=> o---0---o <=> o---0---o
 \e/d\c/       \d/c\b/       \c/b\a/       \b/a\f/       \a/f\e/       \f/e\d/
  o---o         o---o         o---o         o---o         o---o         o---o

    ^                                                                     ^
    |_____________________________________________________________________|

But any o can be an 0

 -----------------------------
/ \ / \ / \ / \ / \ / \ / \ / \
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /
 o---o---o---o---o---o---o---o-
/ \ / \ / \ / \ / \ / \ / \ / \
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /
 o---o---o---o---o---o---o---o-
/ \ / \ / \ / \ / \ / \ / \ / \
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /
 -----------------------------

```

- are there any games that already use this mechanic? If so what themes do the share with this idea?
- what tech would be good to prototype this?