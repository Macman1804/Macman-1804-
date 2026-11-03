import assert from "node:assert/strict";
import test from "node:test";
import { publicError } from "./public-error.ts";

test("account errors stay useful and secrets stay hidden", () => {
  assert.equal(publicError("Invalid login credentials", "No."), "That email or password is not right.");
  assert.equal(publicError("Email not confirmed", "No."), "Confirm the email, then sign in.");
  assert.match(publicError("duplicate key value violates relation \"profiles\"", "Kept private."), /Kept private/);
  assert.equal(publicError("bearer service_role token", "Kept private."), "Kept private.");
  assert.equal(publicError("", "The desk could not keep that."), "The desk could not keep that.");
  assert.equal(
    publicError("Email not confirmed", "No.", "es"),
    "Confirma el correo y luego entra.",
  );
  assert.equal(publicError("Write a shorter line.", "No.", "es"), "Escribe una línea más corta.");
});
