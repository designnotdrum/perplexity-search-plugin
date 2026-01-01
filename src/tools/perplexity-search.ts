/**
 * PerplexitySearchTool - Executes searches using Perplexity API.
 *
 * Responsibilities:
 * - Perform searches via Perplexity API
 * - Optionally enrich queries with user profile context
 * - Format results for MCP tool responses
 */

import { Perplexity } from '@perplexity-ai/perplexity_ai';
import { ProfileManager } from '../profile/manager';
import { PerplexitySearchParams, UserProfile } from '../types';

export class PerplexitySearchTool {
  private client: any;

  constructor(
    apiKey: string,
    private profileManager: ProfileManager
  ) {
    this.client = new Perplexity({ apiKey });
  }

  /**
   * Executes a search with optional profile enrichment.
   */
  async search(params: PerplexitySearchParams): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      let query = params.query;

      // Enrich query with profile context if requested
      if (params.include_profile_context) {
        const profile = await this.profileManager.load();
        const contextString = this.buildContextString(profile);
        query = `${params.query}\n\nUser context: ${contextString}`;
      }

      // Call Perplexity API
      const response = await this.client.chat.completions.create({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: query
          }
        ]
      });

      // Extract content from response
      const content = response.choices[0].message.content;

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(`Perplexity search failed: ${err.message}`);
    }
  }

  /**
   * Builds a context string from user profile.
   * Formats profile data into a concise string for query enrichment.
   */
  private buildContextString(profile: UserProfile): string {
    const parts: string[] = [];

    const { technicalPreferences, workingStyle, projectContext, knowledgeLevel } = profile.profile;

    // Add technical preferences
    if (technicalPreferences.languages.length > 0) {
      parts.push(`Languages: ${technicalPreferences.languages.join(', ')}`);
    }
    if (technicalPreferences.frameworks.length > 0) {
      parts.push(`Frameworks: ${technicalPreferences.frameworks.join(', ')}`);
    }

    // Add working style
    if (workingStyle.explanationPreference) {
      parts.push(`Explanation style: ${workingStyle.explanationPreference}`);
    }

    // Add project context
    if (projectContext.domains.length > 0) {
      parts.push(`Domains: ${projectContext.domains.join(', ')}`);
    }

    return parts.join('; ');
  }
}
