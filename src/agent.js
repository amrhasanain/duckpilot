// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { createSpinner } from "./ui/spinner.js";
import {
  createAssistantWriter,
  showToolCall,
  showToolResult,
  showNotice,
  showInterrupted,
  showSummary,
} from "./ui/render.js";
import { c, sym } from "./ui/ansi.js";

const MAX_STEPS = 30;

// Stay below Groq's 8000 TPM limit with some safety margin.
const REQUEST_TOKEN_BUDGET = 7400;

// Maximum output tokens.
const MAX_OUTPUT_TOKENS = 1800;

// Rough token estimation.
const CHARS_PER_TOKEN = 4;

// Tool-result limits.
const RECENT_TOOL_RESULT_CHARS = 9000;
const OLD_TOOL_RESULT_CHARS = 3000;

// Number of recent conversation groups to preserve.
const MAX_RECENT_GROUPS = 10;


// Estimate tokens from text/JSON.
function estimateTokens(value) {
  if (value == null) return 0;

  let text;

  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  return Math.ceil(text.length / CHARS_PER_TOKEN);
}


// Estimate the token count of all messages.
function estimateMessagesTokens(messages) {
  return messages.reduce((total, message) => {
    return total + estimateTokens(message) + 4;
  }, 0);
}


// Reduce large tool output while preserving the beginning and end.
function compactToolOutput(
  content,
  maxChars,
  label = "tool output"
) {
  if (content == null) return "";

  const text = String(content);

  if (text.length <= maxChars) {
    return text;
  }

  const headChars = Math.floor(maxChars * 0.65);
  const tailChars = Math.floor(maxChars * 0.25);

  const omittedChars =
    text.length - headChars - tailChars;

  return (
    `${text.slice(0, headChars)}\n\n` +
    `[... ${label} middle omitted: ${omittedChars} characters ...]\n` +
    `[If the missing section is required, call the appropriate file/tool operation again with a targeted range.]\n\n` +
    text.slice(-tailChars)
  );
}


// Compact old tool results first.
function compactMessages(messages) {
  return messages.map((message, index) => {
    if (message.role !== "tool") {
      return message;
    }

    const isRecent =
      index >= Math.max(0, messages.length - 8);

    const maxChars = isRecent
      ? RECENT_TOOL_RESULT_CHARS
      : OLD_TOOL_RESULT_CHARS;

    return {
      ...message,
      content: compactToolOutput(
        message.content,
        maxChars,
        "large tool result"
      ),
    };
  });
}


// Compact tool descriptions without removing their schemas.
function compactToolDefinitions(
  definitions,
  aggressive = false
) {
  if (!Array.isArray(definitions)) {
    return definitions;
  }

  return definitions.map((tool) => {
    if (!tool || typeof tool !== "object") {
      return tool;
    }

    const copy = structuredClone(tool);

    const descriptionLimit =
      aggressive ? 160 : 400;

    if (copy.function?.description) {
      copy.function.description =
        compactToolOutput(
          copy.function.description,
          descriptionLimit,
          "tool description"
        );
    }

    const properties =
      copy.function?.parameters?.properties;

    if (properties && typeof properties === "object") {
      for (const property of Object.values(properties)) {
        if (
          property &&
          typeof property === "object" &&
          typeof property.description === "string"
        ) {
          property.description =
            compactToolOutput(
              property.description,
              aggressive ? 80 : 180,
              "parameter description"
            );
        }
      }
    }

    return copy;
  });
}


// Split the conversation into logical groups.
function buildMessageGroups(messages) {
  if (!messages.length) return [];

  const groups = [];

  if (messages[0]?.role === "system") {
    groups.push([messages[0]]);
  }

  let current = [];

  for (let i = 1; i < messages.length; i++) {
    const message = messages[i];

    if (message.role === "user") {
      if (current.length) {
        groups.push(current);
      }

      current = [message];
      continue;
    }

    current.push(message);
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}


// Build a context that fits inside our token budget.
function buildBudgetedMessages({
  messages,
  toolDefinitions,
}) {
  const groups = buildMessageGroups(messages);

  if (!groups.length) {
    return {
      messages: [],
      tools: toolDefinitions,
    };
  }

  const systemGroup =
    groups[0][0]?.role === "system"
      ? groups[0]
      : [];

  const conversationGroups =
    systemGroup.length
      ? groups.slice(1)
      : groups;

  let candidateMessages =
    compactMessages(messages);

  let candidateTools = toolDefinitions;

  const inputBudget =
    REQUEST_TOKEN_BUDGET -
    MAX_OUTPUT_TOKENS;

  let estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  // Everything fits.
  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 1: aggressively reduce tool results.
  candidateMessages = candidateMessages.map(
    (message) => {
      if (message.role !== "tool") {
        return message;
      }

      return {
        ...message,
        content: compactToolOutput(
          message.content,
          1800,
          "older tool result"
        ),
      };
    }
  );

  estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 2: compact tool descriptions.
  candidateTools = compactToolDefinitions(
    toolDefinitions,
    false
  );

  estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 3: aggressively compact tool descriptions.
  candidateTools = compactToolDefinitions(
    toolDefinitions,
    true
  );

  estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 4: keep system prompt + recent conversation.
  const recentGroups = [];

  for (
    let i = conversationGroups.length - 1;
    i >= 0 &&
    recentGroups.length < MAX_RECENT_GROUPS;
    i--
  ) {
    recentGroups.unshift(
      conversationGroups[i]
    );
  }

  candidateMessages = [
    ...systemGroup,
    ...recentGroups.flat(),
  ];

  candidateMessages =
    candidateMessages.map(
      (message, index) => {
        if (message.role !== "tool") {
          return message;
        }

        const isRecent =
          index >=
          candidateMessages.length - 5;

        return {
          ...message,
          content: compactToolOutput(
            message.content,
            isRecent ? 3000 : 1200,
            isRecent
              ? "recent tool result"
              : "older tool result"
          ),
        };
      }
    );

  estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 5: keep only the last 5 conversation groups.
  const fewerGroups =
    conversationGroups.slice(-5);

  candidateMessages = [
    ...systemGroup,
    ...fewerGroups.flat(),
  ];

  candidateMessages =
    candidateMessages.map(
      (message) => {
        if (message.role !== "tool") {
          return message;
        }

        return {
          ...message,
          content: compactToolOutput(
            message.content,
            1400,
            "compacted tool result"
          ),
        };
      }
    );

  estimated =
    estimateMessagesTokens(candidateMessages) +
    estimateTokens(candidateTools);

  if (estimated <= inputBudget) {
    return {
      messages: candidateMessages,
      tools: candidateTools,
    };
  }

  // Stage 6: last resort.
  // Keep system + latest conversation group.
  const latestGroup =
    conversationGroups.at(-1) ?? [];

  candidateMessages = [
    ...systemGroup,
    ...latestGroup,
  ];

  candidateMessages =
    candidateMessages.map(
      (message) => {
        if (message.role !== "tool") {
          return message;
        }

        return {
          ...message,
          content: compactToolOutput(
            message.content,
            1000,
            "last-resort tool result"
          ),
        };
      }
    );

  return {
    messages: candidateMessages,
    tools: candidateTools,
  };
}


// Call the model with streaming.
async function streamCompletion({
  groq,
  model,
  messages,
  tools,
  signal,
  onText,
}) {
  const budgeted =
    buildBudgetedMessages({
      messages,
      toolDefinitions: tools,
    });

  const estimatedInput =
    estimateMessagesTokens(
      budgeted.messages
    ) +
    estimateTokens(budgeted.tools);

  /*
   * Keep enough room below 8000 TPM.
   */
  const availableOutputTokens =
    Math.max(
      512,
      Math.min(
        MAX_OUTPUT_TOKENS,
        REQUEST_TOKEN_BUDGET -
          estimatedInput
      )
    );

  const stream =
    await groq.chat.completions.create(
      {
        model,

        messages: budgeted.messages,

        tools: budgeted.tools,

        tool_choice: "auto",

        max_completion_tokens:
          availableOutputTokens,

        temperature: 0.2,

        stream: true,
      },
      { signal }
    );

  let content = "";
  let finishReason = null;

  const calls = [];

  for await (const chunk of stream) {
    const choice =
      chunk.choices?.[0];

    if (!choice) continue;

    const delta =
      choice.delta ?? {};

    if (delta.content) {
      content += delta.content;
      onText(delta.content);
    }

    for (
      const part of
      delta.tool_calls ?? []
    ) {
      const i =
        part.index ?? 0;

      calls[i] ??= {
        id: "",
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };

      if (part.id) {
        calls[i].id = part.id;
      }

      if (
        part.function?.name &&
        !calls[i].function.name
      ) {
        calls[i].function.name =
          part.function.name;
      }

      if (part.function?.arguments) {
        calls[i].function.arguments +=
          part.function.arguments;
      }
    }

    if (choice.finish_reason) {
      finishReason =
        choice.finish_reason;
    }
  }

  return {
    content,
    toolCalls:
      calls.filter(Boolean),
    finishReason,
  };
}


function toAssistantMessage({
  content,
  toolCalls,
}) {
  const msg = {
    role: "assistant",
    content:
      content ||
      (toolCalls.length
        ? null
        : ""),
  };

  if (toolCalls.length) {
    msg.tool_calls =
      toolCalls;
  }

  return msg;
}


export function createAgent({
  groq,
  model,
  tools,
  systemPrompt,
}) {
  let currentModel = model;

  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  async function chat(
    userInput,
    { signal } = {}
  ) {
    messages.push({
      role: "user",
      content: userInput,
    });

    const spinner =
      createSpinner();

    const startedAt =
      Date.now();

    let toolCount = 0;

    for (
      let step = 0;
      step < MAX_STEPS;
      step++
    ) {
      const writer =
        createAssistantWriter();

      let result;

      spinner.start();

      try {
        result =
          await streamCompletion({
            groq,
            model: currentModel,
            messages,
            tools: tools.definitions,
            signal,

            onText: (text) => {
              spinner.stop();
              writer.write(text);
            },
          });
      } catch (e) {
        spinner.stop();
        writer.end();

        if (signal?.aborted) {
          showInterrupted();
          return;
        }

        throw e;
      }

      spinner.stop();
      writer.end();

      messages.push(
        toAssistantMessage(result)
      );

      // The reply was cut off.
      if (
        result.finishReason ===
        "length"
      ) {
        showNotice(
          "Output was cut off. Continuing with a smaller response..."
        );

        for (
          const call of
          result.toolCalls
        ) {
          messages.push({
            role: "tool",
            tool_call_id:
              call.id,
            content:
              "Error: your output was cut off, " +
              "this call was NOT executed. " +
              "Retry with smaller content.",
          });
        }

        messages.push({
          role: "user",
          content:
            "Your last reply was cut off. " +
            "Continue the task using smaller tool calls. " +
            "For large files, work in smaller sections. " +
            "Do not rewrite an entire large file if an edit operation can modify only the required section.",
        });

        continue;
      }

      // No tools requested.
      if (
        !result.toolCalls.length
      ) {
        showSummary(
          startedAt,
          toolCount
        );

        return;
      }

      // Execute requested tools.
      for (
        const call of
        result.toolCalls
      ) {
        if (signal?.aborted) {
          messages.push({
            role: "tool",
            tool_call_id:
              call.id,
            content:
              "Cancelled by user.",
          });

          continue;
        }

        let args;

        try {
          args = JSON.parse(
            call.function.arguments ||
              "{}"
          );
        } catch {
          showToolCall(
            call.function.name,
            {}
          );

          console.log(
            `  ${c.dim(sym.corner)}  ${c.red(
              "Invalid JSON arguments, asking the model to retry"
            )}`
          );

          messages.push({
            role: "tool",
            tool_call_id:
              call.id,
            content:
              "Error: invalid JSON arguments. " +
              "Try again with smaller content.",
          });

          continue;
        }

        showToolCall(
          call.function.name,
          args
        );

        let output;

        try {
          output =
            await tools.runTool(
              call.function.name,
              args,
              { signal }
            );
        } catch (error) {
          output =
            `Tool error: ${
              error?.message ||
              String(error)
            }`;
        }

        showToolResult(
          call.function.name,
          args,
          output
        );

        toolCount++;

        /*
         * Keep the complete result internally.
         * It will only be compacted when preparing
         * the next request.
         */
        messages.push({
          role: "tool",
          tool_call_id:
            call.id,
          content:
            String(output ?? ""),
        });
      }

      if (signal?.aborted) {
        showInterrupted();
        return;
      }
    }

    showNotice(
      `Reached the limit of ${MAX_STEPS} steps. ` +
      `Tell me to continue if the task isn't finished.`
    );
  }

  return {
    chat,

    reset() {
      messages.length = 1;
    },

    getModel: () =>
      currentModel,

    setModel(name) {
      currentModel = name;
    },
  };
}