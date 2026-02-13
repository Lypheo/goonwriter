
import { useModelStore } from '../../stores';
import { DEFAULT_SAMPLING_PARAMS } from '../../types';
import { Collapsible, Slider } from '../ui/common';

const PARAM_TOOLTIPS = {
  temperature: 'This setting influences the variety in the model\'s responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input.',
  top_p: 'This setting limits the model\'s choices to a percentage of likely tokens: only the top tokens whose probabilities add up to P. A lower value makes the model\'s responses more predictable, while the default setting allows for a full range of token choices. Think of it like a dynamic Top-K.',
  top_k: 'This limits the model\'s choice of tokens at each step, making it choose from a smaller set. A value of 1 means the model will always pick the most likely next token, leading to predictable results. By default this setting is disabled, making the model consider all choices.',
  frequency_penalty: 'This setting aims to control the repetition of tokens based on how often they appear in the input. It tries to use less frequently those tokens that appear more in the input, proportional to how frequently they occur. Token penalty scales with the number of occurrences. Negative values will encourage token reuse.',
  presence_penalty: 'Adjusts how often the model repeats specific tokens already used in the input. Higher values make such repetition less likely, while negative values do the opposite. Token penalty does not scale with the number of occurrences. Negative values will encourage token reuse.',
  repetition_penalty: 'Helps to reduce the repetition of tokens from the input. A higher value makes the model less likely to repeat tokens, but too high a value can make the output less coherent (often with run-on sentences that lack small words). Token penalty scales based on original token\'s probability.',
  min_p: 'Represents the minimum probability for a token to be considered, relative to the probability of the most likely token. If your Min-P is set to 0.1, that means it will only allow for tokens that are at least 1/10th as probable as the best possible option.',
  top_a: 'Consider only the top tokens with "sufficiently high" probabilities based on the probability of the most likely token. Think of it like a dynamic Top-P. A lower Top-A value focuses the choices based on the highest probability token but with a narrower scope.',
  max_tokens: 'The maximum number of tokens to generate in the response. Higher values allow for longer responses but may take more time and cost more.',
};

export function SamplingParams() {
  const { samplingParams, setSamplingParams, resetSamplingParams } = useModelStore();
  
  return (
    <Collapsible title="Sampling Parameters" defaultOpen={false}>
      <div className="space-y-4 pt-2">
        <Slider
          label="Temperature"
          value={samplingParams.temperature ?? DEFAULT_SAMPLING_PARAMS.temperature}
          onChange={(value) => setSamplingParams({ temperature: value })}
          min={0}
          max={2}
          step={0.05}
          tooltip={PARAM_TOOLTIPS.temperature}
        />
        
        <Slider
          label="Top P"
          value={samplingParams.top_p ?? DEFAULT_SAMPLING_PARAMS.top_p}
          onChange={(value) => setSamplingParams({ top_p: value })}
          min={0}
          max={1}
          step={0.05}
          tooltip={PARAM_TOOLTIPS.top_p}
        />
        
        <Slider
          label="Top K"
          value={samplingParams.top_k ?? DEFAULT_SAMPLING_PARAMS.top_k}
          onChange={(value) => setSamplingParams({ top_k: Math.round(value) })}
          min={0}
          max={100}
          step={1}
          tooltip={PARAM_TOOLTIPS.top_k}
        />
        
        <Slider
          label="Frequency Penalty"
          value={samplingParams.frequency_penalty ?? DEFAULT_SAMPLING_PARAMS.frequency_penalty}
          onChange={(value) => setSamplingParams({ frequency_penalty: value })}
          min={-2}
          max={2}
          step={0.1}
          tooltip={PARAM_TOOLTIPS.frequency_penalty}
        />
        
        <Slider
          label="Presence Penalty"
          value={samplingParams.presence_penalty ?? DEFAULT_SAMPLING_PARAMS.presence_penalty}
          onChange={(value) => setSamplingParams({ presence_penalty: value })}
          min={-2}
          max={2}
          step={0.1}
          tooltip={PARAM_TOOLTIPS.presence_penalty}
        />
        
        <Slider
          label="Repetition Penalty"
          value={samplingParams.repetition_penalty ?? DEFAULT_SAMPLING_PARAMS.repetition_penalty}
          onChange={(value) => setSamplingParams({ repetition_penalty: value })}
          min={0}
          max={2}
          step={0.05}
          tooltip={PARAM_TOOLTIPS.repetition_penalty}
        />
        
        <Slider
          label="Min P"
          value={samplingParams.min_p ?? DEFAULT_SAMPLING_PARAMS.min_p}
          onChange={(value) => setSamplingParams({ min_p: value })}
          min={0}
          max={1}
          step={0.05}
          tooltip={PARAM_TOOLTIPS.min_p}
        />
        
        <Slider
          label="Top A"
          value={samplingParams.top_a ?? DEFAULT_SAMPLING_PARAMS.top_a}
          onChange={(value) => setSamplingParams({ top_a: value })}
          min={0}
          max={1}
          step={0.05}
          tooltip={PARAM_TOOLTIPS.top_a}
        />
        
        <button
          onClick={resetSamplingParams}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Reset to defaults
        </button>
      </div>
    </Collapsible>
  );
}
