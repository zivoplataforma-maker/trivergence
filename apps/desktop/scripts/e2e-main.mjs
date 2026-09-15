import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app } from "electron";

const require = createRequire(import.meta.url);
const axeSource = require("axe-core").source;
const directory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(directory, "..");
const mainEntry = path.resolve(applicationRoot, "dist/main/index.js");
const E2E_TIMEOUT_MS = 40_000;
const documentationCaptureDirectory = process.env.TRIVERGENCE_CAPTURE_DIR;

process.env.TRIVERGENCE_E2E_TEST = "1";

let finished = false;

function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`Electron E2E failed: ${message}\n`);
  app.exit(1);
}

const timeout = setTimeout(() => {
  fail(new Error(`Timed out after ${E2E_TIMEOUT_MS}ms`));
}, E2E_TIMEOUT_MS);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

app.on("browser-window-created", (_event, window) => {
  window.webContents.once("did-finish-load", async () => {
    try {
      window.webContents.focus();
      window.webContents.sendInputEvent({ type: "keyDown", keyCode: "TAB" });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode: "TAB" });
      await delay(100);
      const firstFocus = await window.webContents.executeJavaScript(
        "document.activeElement?.textContent?.trim()",
      );
      if (firstFocus !== "Saltar al contenido principal") {
        throw new Error(`Unexpected first keyboard focus: ${firstFocus}`);
      }

      const result = await window.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const findButton = (label) => [...document.querySelectorAll("button")]
            .find((candidate) => candidate.textContent?.trim() === label);
          const setValue = (selector, value) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLInputElement) &&
                !(element instanceof HTMLTextAreaElement) &&
                !(element instanceof HTMLSelectElement)) {
              throw new Error("Missing form input: " + selector);
            }
            const prototype = element instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : element instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
            element.dispatchEvent(new Event(
              element instanceof HTMLSelectElement ? "change" : "input",
              { bubbles: true },
            ));
          };
          const waitFor = (predicate, timeoutMessage, startedAt = Date.now()) => {
            const value = predicate();
            if (value) return Promise.resolve(value);
            if (Date.now() - startedAt > 12_000) {
              return Promise.reject(new Error(timeoutMessage));
            }
            return new Promise((next) => setTimeout(next, 60)).then(() =>
              waitFor(predicate, timeoutMessage, startedAt),
            );
          };

          (async () => {
            const select = findButton("Elegir carpeta");
            if (!select) throw new Error("Workspace selection button was not rendered");
            select.click();
            await waitFor(
              () => document.querySelector(".workspaceMeta"),
              "Workspace selection did not complete",
            );

            const previewButton = findButton("Comparar rutas y crear plan");
            if (!previewButton) throw new Error("Preview button was not rendered");
            previewButton.click();
            await waitFor(
              () => document.querySelector(".planStep"),
              "Preview result was not rendered",
            );

            const execute = findButton("Ejecutar plan aprobado");
            if (!execute || execute.disabled) {
              throw new Error("Execution button was not enabled");
            }
            execute.click();
            await waitFor(
              () => document.querySelector(".result pre"),
              "Workspace execution result was not rendered",
            );

            const readOutput = document.querySelector(".result pre")?.textContent;
            const readEvaluation = document.querySelector(".stateBadge.ready")
              ?.textContent?.trim();
            const readStep = document.querySelector(".planStep")
              ?.textContent?.replace(/\\s+/gu, " ").trim();
            const readTimeline = document.querySelector(".timeline")
              ?.textContent?.replace(/\\s+/gu, " ").trim();
            setValue("#goal", "Buscar texto TODO en el workspace");
            setValue("#detail", "TODO");
            await waitFor(() => !document.querySelector(".planStep"),
              "Changing the objective did not invalidate the plan");

            const searchPreview = findButton("Comparar rutas y crear plan");
            if (!searchPreview || searchPreview.disabled) {
              throw new Error("Search preview button was not enabled");
            }
            searchPreview.click();
            await waitFor(
              () => document.querySelector(".planStep")?.textContent
                ?.includes("workspace.search.literal"),
              "Search capability was not planned",
            );

            const searchExecute = findButton("Ejecutar plan aprobado");
            if (!searchExecute || searchExecute.disabled) {
              throw new Error("Search execution button was not enabled");
            }
            searchExecute.click();
            const cancel = await waitFor(
              () => findButton("Cancelar ejecución"),
              "Cancellation control was not rendered",
            );
            cancel.click();
            const cancelled = await waitFor(
              () => document.querySelector(".stateBadge.cancelled"),
              "Search execution was not cancelled",
            );

            setValue("#goal", "Pedir respuesta al Reference Provider local");
            setValue("#detail", "Contrato Provider Adapter de prueba");
            setValue("#profile", "assistant");
            await waitFor(() => !document.querySelector(".planStep"),
              "Reference objective did not invalidate the plan");
            const referencePreview = findButton("Comparar rutas y crear plan");
            referencePreview.click();
            await waitFor(
              () => document.querySelector(".planStep")?.textContent
                ?.includes("provider.reference.prompt.structured"),
              "Reference Provider capability was not planned",
            );
            const review = findButton("Revisar aprobación");
            if (!review) throw new Error("Reference approval control was not rendered");
            review.click();
            const approval = await waitFor(
              () => document.querySelector(".approvalReview"),
              "Reference context preview was not rendered",
            );
            const approvalText = approval.textContent?.replace(/\\s+/gu, " ").trim();
            const grant = findButton("Permitir una vez");
            if (!grant) throw new Error("One-use approval control was not rendered");
            grant.click();
            await waitFor(
              () => document.querySelector(".notice")?.textContent
                ?.includes("Aprobación concedida"),
              "Reference approval was not granted",
            );
            const referenceExecute = findButton("Ejecutar plan aprobado");
            if (!referenceExecute || referenceExecute.disabled) {
              throw new Error("Reference execution button was not enabled");
            }
            referenceExecute.click();
            const referenceOutput = await waitFor(
              () => [...document.querySelectorAll(".result pre")]
                .find((candidate) => candidate.textContent
                  ?.includes("Reference response:")),
              "Reference Provider result was not rendered",
            );
            const stream = await waitFor(
              () => [...document.querySelectorAll(".notice")]
                .find((candidate) => candidate.textContent
                  ?.includes("Stream local:")),
              "Reference stream evidence was not rendered",
            );

            setValue("#goal", "Coordinar un equipo local con memoria y evaluación auditable");
            setValue("#detail", "");
            await waitFor(() => !document.querySelector(".planStep"),
              "M6 objective did not invalidate the plan");
            const m6Preview = findButton("Comparar rutas y crear plan");
            m6Preview.click();
            await waitFor(
              () => document.querySelectorAll(".planStep").length === 5,
              "M6 workflow did not produce five planned steps",
            );
            for (let index = 0; index < 3; index += 1) {
              const reviewM6 = await waitFor(
                () => [...document.querySelectorAll("button")].find(
                  (candidate) =>
                    candidate.textContent?.trim() === "Revisar aprobación" &&
                    !candidate.disabled,
                ),
                "M6 approval control was not available",
              );
              reviewM6.click();
              await waitFor(
                () => document.querySelector(".approvalReview"),
                "M6 approval detail was not rendered",
              );
              const grantM6 = findButton("Permitir una vez");
              if (!grantM6) throw new Error("M6 one-use grant was not rendered");
              grantM6.click();
              await waitFor(
                () => [...document.querySelectorAll("button")].filter(
                  (candidate) => candidate.textContent?.trim() === "Aprobado una vez",
                ).length === index + 1,
                "M6 approval was not granted",
              );
            }
            const m6Execute = findButton("Ejecutar plan aprobado");
            if (!m6Execute || m6Execute.disabled) {
              throw new Error("M6 execution button was not enabled");
            }
            m6Execute.click();
            const m6Output = await waitFor(
              () => [...document.querySelectorAll(".result pre")].find(
                (candidate) => candidate.getAttribute("aria-label")
                  === "Resultado auditable del workflow",
              ),
              "M6 auditable result was not rendered",
            );
            const m6Timeline = document.querySelector(".timeline")
              ?.textContent?.replace(/\\s+/gu, " ").trim();
            await waitFor(
              () => document.querySelectorAll("#historial > ol.historyList li").length >= 3,
              "Execution history did not show prior runs",
            );
            await waitFor(
              () => document.querySelectorAll("[aria-label='Eventos de auditoría'] li").length > 0,
              "Audit events were not visible",
            );
            const historyCount = document.querySelectorAll("#historial > ol.historyList li").length;
            const auditCount = document.querySelectorAll("[aria-label='Eventos de auditoría'] li").length;
            const auditVerified = document.querySelector("#historial [role='status']")?.textContent;
            const retentionVisible = Boolean(document.querySelector("#retentionDays"));
            const privacy = document.querySelector("#privacidad")?.textContent;

            resolve({
              evaluation: readEvaluation,
              output: readOutput,
              step: readStep,
              timeline: readTimeline,
              cancellation: cancelled.textContent?.trim(),
              referenceApproval: approvalText,
              referenceOutput: referenceOutput.textContent?.trim(),
              referenceStream: stream.textContent?.replace(/\\s+/gu, " ").trim(),
              m6Output: m6Output.textContent?.trim(),
              m6Timeline,
              historyCount,
              auditCount,
              auditVerified,
              retentionVisible,
              privacy,
              url: location.href,
            });
          })().catch(reject);
        });
      `);

      if (result.url !== "trivergence://app/index.html") {
        throw new Error(`Unexpected renderer URL: ${result.url}`);
      }
      if (result.evaluation !== "Plan listo · sin ejecutar") {
        throw new Error(`Unexpected evaluation: ${result.evaluation}`);
      }
      if (!result.step?.includes("workspace.file.read")) {
        throw new Error(
          `Workspace read capability was not planned: ${result.step}`,
        );
      }
      if (result.output?.trim() !== "E2E workspace content") {
        throw new Error(`Unexpected workspace output: ${result.output}`);
      }
      if (!result.timeline?.includes("1 evidencia(s) registradas")) {
        throw new Error(
          `Evidence timeline was not rendered: ${result.timeline}`,
        );
      }
      if (result.cancellation !== "Ejecución cancelada") {
        throw new Error(
          `Unexpected cancellation state: ${result.cancellation}`,
        );
      }
      if (
        !result.referenceApproval?.includes("local://reference-provider") ||
        !result.referenceApproval?.includes("sin red")
      ) {
        throw new Error(
          `Reference context preview was incomplete: ${result.referenceApproval}`,
        );
      }
      if (!result.referenceOutput?.includes("Reference response:")) {
        throw new Error(
          `Unexpected Reference Provider output: ${result.referenceOutput}`,
        );
      }
      if (!result.referenceStream?.includes("fragmento(s)")) {
        throw new Error(`Missing reference stream: ${result.referenceStream}`);
      }
      if (!result.m6Output?.includes("Reference response:")) {
        throw new Error(`Unexpected M6 output: ${result.m6Output}`);
      }
      if (!result.m6Timeline?.includes("5 evidencia(s) registradas")) {
        throw new Error(
          `M6 evidence timeline was incomplete: ${result.m6Timeline}`,
        );
      }
      if (!result.m6Timeline?.includes("Evaluación posterior: accepted")) {
        throw new Error(
          `Core postflight evaluation was missing: ${result.m6Timeline}`,
        );
      }
      if (
        result.historyCount < 3 ||
        result.auditCount < 1 ||
        !result.auditVerified?.includes("verificada") ||
        !result.retentionVisible ||
        !result.privacy?.includes("Ningún proveedor externo")
      ) {
        throw new Error(
          `History or privacy controls were not visible: ${result.historyCount}; ${result.privacy}`,
        );
      }

      await window.webContents.executeJavaScript(axeSource);
      const providerCheck = await window.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('nav a[href="#proveedores"]').click();
          for (let attempt = 0; attempt < 100 && !document.querySelector('#preferred-provider'); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 60));
          }
          const cards = document.querySelectorAll('[data-provider-id]');
          if (cards.length !== 4) throw new Error('Missing provider configuration cards');
          if (document.querySelector('input[type="password"]')) throw new Error('Credential input present');
          const select = document.querySelector('#preferred-provider');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'ollama');
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 50));
          document.querySelector('#proveedores form').requestSubmit();
          for (let attempt = 0; attempt < 100 && !document.querySelector('.saveNotice'); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 60));
          }
          if (!document.querySelector('.saveNotice')) throw new Error('Preferences were not saved');
          const saved = await window.trivergence.getProviderConfiguration();
          if (saved.preferences.preferredProviderId !== 'ollama') throw new Error('Preferences not persisted');
          if (saved.providers.some(provider => provider.executionEnabled || !provider.blocked || provider.gate !== 'pending')) throw new Error('Gate bypass');
          let rejected = false;
          try { await window.trivergence.saveProviderConfiguration({ ...saved.preferences, executionEnabled: true }); } catch { rejected = true; }
          if (!rejected) throw new Error('IPC accepted forged authority');
          return true;
        })()
      `);
      if (!providerCheck) throw new Error("Provider settings E2E failed");
      const screenshotDirectory = path.resolve(
        applicationRoot,
        "../../artifacts",
      );
      mkdirSync(screenshotDirectory, { recursive: true });
      window.showInactive();
      await window.webContents.executeJavaScript(
        "document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0)",
      );
      window.webContents.invalidate();
      await delay(400);
      writeFileSync(
        path.join(screenshotDirectory, "ui-providers.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      if (documentationCaptureDirectory) {
        mkdirSync(documentationCaptureDirectory, { recursive: true });
        window.setSize(1440, 950);
        const capture = async (
          name,
          navigationTarget,
          selector,
          waitSelector = selector,
        ) => {
          await window.webContents.executeJavaScript(`
            (async () => {
            document.querySelector('nav a[href="#${navigationTarget}"]')?.click();
            for (let attempt = 0; attempt < 100 && !document.querySelector(${JSON.stringify(waitSelector)}); attempt++) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            ${selector === "__top__" ? "window.scrollTo(0, 0);" : `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "start" });`}
            })()
          `);
          window.webContents.invalidate();
          await delay(300);
          writeFileSync(
            path.join(documentationCaptureDirectory, name),
            (await window.webContents.capturePage()).toPNG(),
          );
        };
        await capture(
          "01-mission-control.png",
          "orquestacion",
          "__top__",
          "#orquestacion",
        );
        await capture(
          "02-objective-strategy-plan.png",
          "orquestacion",
          "[aria-labelledby='plan-title']",
        );
        await capture(
          "03-execution-approvals-progress.png",
          "ejecucion",
          ".approvalCenter",
        );
        await capture(
          "04-history-audit-evidence.png",
          "historial",
          "#historial",
        );
        await capture("05-privacy-recovery.png", "privacidad", "#privacidad");
        await capture(
          "06-provider-gates.png",
          "proveedores",
          "#proveedores",
          "#preferred-provider",
        );
      }
      const violations = await window.webContents.executeJavaScript(`
        window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        }).then((results) => results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        })));
      `);
      if (violations.length > 0) {
        throw new Error(`axe violations: ${JSON.stringify(violations)}`);
      }

      window.webContents.setZoomFactor(2);
      await delay(200);
      const hasHorizontalOverflow = await window.webContents.executeJavaScript(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1",
      );
      if (hasHorizontalOverflow) {
        throw new Error(
          "The critical flow has horizontal overflow at 200% zoom",
        );
      }

      window.webContents.setZoomFactor(1);
      await window.webContents.executeJavaScript(
        `document.querySelector('nav a[href="#orquestacion"]').click(); window.scrollTo(0, 0);`,
      );
      window.webContents.invalidate();
      await delay(400);
      writeFileSync(
        path.join(screenshotDirectory, "ui-orchestration.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      const workbenchViolations = await window.webContents.executeJavaScript(
        `window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(result => result.violations.map(item => item.id))`,
      );
      if (workbenchViolations.length)
        throw new Error(
          "Workbench accessibility: " + workbenchViolations.join(", "),
        );
      window.webContents.setZoomFactor(2);
      await delay(100);
      if (
        await window.webContents.executeJavaScript(
          "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1",
        )
      )
        throw new Error("Workbench overflow at 200%");
      window.hide();

      finished = true;
      clearTimeout(timeout);
      process.stdout.write(
        "Electron workspace, Reference Provider, M6 workflow and provider configuration E2E passed.\n",
      );
      app.quit();
    } catch (error) {
      fail(error);
    }
  });

  window.webContents.once("render-process-gone", (_event, details) => {
    fail(new Error(`Renderer process ended: ${details.reason}`));
  });
});

void import(pathToFileURL(mainEntry).href).catch(fail);
