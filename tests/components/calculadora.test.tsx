// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Calculadora from "@/components/tools/Calculadora";

async function presionar(user: ReturnType<typeof userEvent.setup>, ...teclas: string[]) {
  for (const t of teclas) await user.click(screen.getByRole("button", { name: t }));
}

describe("Calculadora (interfaz)", () => {
  it("calcula con los botones", async () => {
    const user = userEvent.setup();
    render(<Calculadora />);
    await presionar(user, "1", "2", "Sumar", "3", "Multiplicar", "2", "Calcular");
    expect(screen.getByTestId("calc-resultado")).toHaveTextContent("= 18");
  });

  it("muestra error al dividir por cero", async () => {
    const user = userEvent.setup();
    render(<Calculadora />);
    await presionar(user, "6", "Dividir", "0", "Calcular");
    expect(screen.getByTestId("calc-resultado")).toHaveTextContent("No se puede dividir por cero");
  });

  it("permite escribir la expresión con el teclado y Enter", async () => {
    const user = userEvent.setup();
    render(<Calculadora />);
    await user.type(screen.getByLabelText("Expresión"), "9-4{Enter}");
    expect(screen.getByTestId("calc-resultado")).toHaveTextContent("= 5");
  });
});
