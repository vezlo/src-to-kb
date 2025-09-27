// Answer Mode Configuration
// Defines different modes for generating answers based on user type

const ANSWER_MODES = {
  // End User mode - for non-technical users
  enduser: {
    name: 'End User',
    description: 'Simplified answers for non-technical users, avoiding internal implementation details',
    filters: {
      // Exclude internal/architecture files
      excludePatterns: [
        /test\./i,
        /spec\./i,
        /\.test\./i,
        /\.spec\./i,
        /internal/i,
        /private/i,
        /debug/i,
        /mock/i,
        /stub/i,
        /__tests__/i,
        /\.d\.ts$/
      ],
      // Focus on user-facing features
      prioritizeTypes: ['documentation', 'api', 'interface', 'public'],
      // Limit technical depth
      maxTechnicalDepth: 'low'
    },
    answerStyle: {
      includeImplementationDetails: false,
      includeCodeSnippets: false,
      focusOn: 'features and capabilities',
      tone: 'simple and friendly',
      avoidTerms: ['architecture', 'implementation', 'internal', 'backend', 'database', 'schema'],
      examplePrompt: 'Explain what this feature does from a user perspective'
    }
  },

  // Developer mode - for technical users
  developer: {
    name: 'Developer',
    description: 'Detailed technical answers including architecture and implementation details',
    filters: {
      // Include all technical files
      excludePatterns: [],
      // Prioritize code and technical docs
      prioritizeTypes: ['code', 'test', 'config', 'architecture', 'internal'],
      // Full technical depth
      maxTechnicalDepth: 'high'
    },
    answerStyle: {
      includeImplementationDetails: true,
      includeCodeSnippets: true,
      focusOn: 'technical implementation and architecture',
      tone: 'technical and precise',
      includeTerms: ['implementation', 'architecture', 'design patterns', 'dependencies', 'data flow'],
      examplePrompt: 'Explain the technical implementation with code examples'
    }
  },

  // Copilot mode - for code assistance
  copilot: {
    name: 'Copilot',
    description: 'Code-focused answers with examples and patterns for implementation',
    filters: {
      // Focus on implementation files
      excludePatterns: [
        /README/i,
        /CHANGELOG/i,
        /LICENSE/i,
        /\.md$/
      ],
      // Prioritize actual code
      prioritizeTypes: ['code', 'test', 'example', 'snippet'],
      // Medium technical depth with code focus
      maxTechnicalDepth: 'medium'
    },
    answerStyle: {
      includeImplementationDetails: true,
      includeCodeSnippets: true,
      focusOn: 'code examples and implementation patterns',
      tone: 'instructive with examples',
      includeTerms: ['example', 'pattern', 'usage', 'implementation', 'code'],
      examplePrompt: 'Show code examples and implementation patterns',
      preferCodeOverExplanation: true
    }
  }
};

class AnswerModeManager {
  constructor(mode = 'developer') {
    this.currentMode = ANSWER_MODES[mode] || ANSWER_MODES.developer;
    this.modeName = mode;
  }

  setMode(mode) {
    if (ANSWER_MODES[mode]) {
      this.currentMode = ANSWER_MODES[mode];
      this.modeName = mode;
      return true;
    }
    return false;
  }

  getAvailableModes() {
    return Object.keys(ANSWER_MODES).map(key => ({
      key,
      name: ANSWER_MODES[key].name,
      description: ANSWER_MODES[key].description
    }));
  }

  getCurrentMode() {
    return {
      key: this.modeName,
      ...this.currentMode
    };
  }

  // Filter search results based on mode
  filterResults(searchResults) {
    const filtered = searchResults.filter(result => {
      // Check against exclude patterns
      const shouldExclude = this.currentMode.filters.excludePatterns.some(pattern =>
        pattern.test(result.documentPath)
      );

      if (shouldExclude) {
        return false;
      }

      return true;
    });

    // Sort by priority types if specified
    if (this.currentMode.filters.prioritizeTypes.length > 0) {
      filtered.sort((a, b) => {
        const aHasPriority = this.currentMode.filters.prioritizeTypes.some(type =>
          a.documentPath.toLowerCase().includes(type) ||
          a.documentLang?.toLowerCase() === type
        );
        const bHasPriority = this.currentMode.filters.prioritizeTypes.some(type =>
          b.documentPath.toLowerCase().includes(type) ||
          b.documentLang?.toLowerCase() === type
        );

        if (aHasPriority && !bHasPriority) return -1;
        if (!aHasPriority && bHasPriority) return 1;
        return b.score - a.score; // Fall back to score
      });
    }

    return filtered;
  }

  // Customize the prompt for AI based on mode
  generateAIPrompt(query, context) {
    const style = this.currentMode.answerStyle;
    let prompt = `Mode: ${this.currentMode.name}\n`;
    prompt += `Focus: ${style.focusOn}\n`;
    prompt += `Tone: ${style.tone}\n\n`;

    if (style.avoidTerms) {
      prompt += `Avoid using technical terms like: ${style.avoidTerms.join(', ')}\n`;
    }

    if (style.includeTerms) {
      prompt += `Include relevant terms like: ${style.includeTerms.join(', ')}\n`;
    }

    prompt += `\nQuery: "${query}"\n\n`;
    prompt += `Search Results from codebase:\n`;
    prompt += context.map(r => {
      let content = `File: ${r.file}\n`;
      if (style.includeCodeSnippets && r.content) {
        content += `Content: ${r.content.substring(0, 500)}...\n`;
      }
      return content;
    }).join('\n');

    prompt += `\n${style.examplePrompt}`;

    if (!style.includeImplementationDetails) {
      prompt += '\nDo not include internal implementation details or architecture information.';
    }

    if (style.preferCodeOverExplanation) {
      prompt += '\nPrioritize showing code examples over explanations.';
    }

    return prompt;
  }

  // Format answer based on mode
  formatAnswer(baseAnswer, searchResults) {
    const style = this.currentMode.answerStyle;
    let formattedAnswer = baseAnswer;

    // For end users, remove technical jargon
    if (this.modeName === 'enduser') {
      // Remove code blocks if present
      if (!style.includeCodeSnippets) {
        formattedAnswer = formattedAnswer.replace(/```[\s\S]*?```/g, '[Code example removed for clarity]');
      }

      // Simplify file references
      formattedAnswer = formattedAnswer.replace(/📂 \*\*Source files\*\*:.*$/m, '');
    }

    // For copilot mode, emphasize code
    if (this.modeName === 'copilot' && searchResults.length > 0) {
      const codeExamples = searchResults
        .filter(r => r.fullContent)
        .slice(0, 2)
        .map(r => {
          const lines = r.fullContent.split('\n').slice(0, 20);
          return `\`\`\`${r.documentLang?.toLowerCase() || 'javascript'}\n// From: ${r.documentPath}\n${lines.join('\n')}\n\`\`\``;
        });

      if (codeExamples.length > 0) {
        formattedAnswer += '\n\n📝 **Code Examples**:\n' + codeExamples.join('\n\n');
      }
    }

    return formattedAnswer;
  }
}

module.exports = {
  ANSWER_MODES,
  AnswerModeManager
};