import { useGenerationStore } from '../../stores';

export function ResponseMetadata() {
  const { responseMetadata, isGenerating } = useGenerationStore();
  
  if (!responseMetadata) {
    return (
      <div className="p-3 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-600 mb-2">Response Info</h4>
        <p className="text-xs text-gray-400">No generation yet</p>
      </div>
    );
  }
  
  const formatCostCents = (cost: number | undefined) => {
    if (cost === undefined || cost === null) return null;
    const cents = cost * 100;
    return `${cents.toFixed(4)}¢`;
  };
  
  return (
    <div className="p-3 border-t border-gray-200">
      <h4 className="text-sm font-medium text-gray-600 mb-2">Response Info</h4>
      
      <div className="space-y-2 text-xs">
        {/* Error */}
        {responseMetadata.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700">
            <span className="font-medium">Error: </span>
            {responseMetadata.error}
          </div>
        )}
        
        {/* Status */}
        {isGenerating && (
          <div className="flex items-center gap-2 text-blue-600">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Generating...</span>
          </div>
        )}
        
        {/* Provider & Model */}
        {responseMetadata.provider && (
          <div className="flex justify-between">
            <span className="text-gray-500">Provider:</span>
            <span className="font-medium">{responseMetadata.provider}</span>
          </div>
        )}
        
        {responseMetadata.model && (
          <div className="flex justify-between">
            <span className="text-gray-500">Model:</span>
            <span className="font-medium truncate ml-2" title={responseMetadata.model}>
              {responseMetadata.model.split('/').pop()}
            </span>
          </div>
        )}
        
        {/* Finish Reason - always show if available */}
        {responseMetadata.finishReason && (
          <div className="flex justify-between">
            <span className="text-gray-500">Finish:</span>
            <span className={`font-medium ${
              responseMetadata.finishReason === 'stop' ? 'text-green-600' :
              responseMetadata.finishReason === 'length' ? 'text-yellow-600' :
              'text-gray-700'
            }`}>
              {responseMetadata.finishReason}
              {responseMetadata.nativeFinishReason && responseMetadata.nativeFinishReason !== responseMetadata.finishReason && (
                <span className="text-gray-400"> ({responseMetadata.nativeFinishReason})</span>
              )}
            </span>
          </div>
        )}
        
        {/* WPS */}
        {responseMetadata.wordsPerSecond > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Speed:</span>
            <span className="font-medium">{responseMetadata.wordsPerSecond.toFixed(1)} w/s</span>
          </div>
        )}
        
        {/* Usage - inline with prominent total */}
        {responseMetadata.usage && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Tokens:</span>
              <span>
                <span className="text-gray-400" title="Prompt tokens">{responseMetadata.usage.prompt_tokens}</span>
                <span className="text-gray-300"> + </span>
                <span className="text-gray-400" title="Completion tokens">{responseMetadata.usage.completion_tokens}</span>
                <span className="text-gray-300"> = </span>
                <span className="font-semibold text-sm text-gray-800" title="Total tokens">{responseMetadata.usage.total_tokens}</span>
              </span>
            </div>
            
            {/* Cost */}
            {responseMetadata.usage.cost !== undefined && responseMetadata.usage.cost !== null && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Cost:</span>
                <span className="font-medium text-gray-700">{formatCostCents(responseMetadata.usage.cost)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
