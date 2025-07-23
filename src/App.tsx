import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { Trash2, Edit2, Check, X, Shield, AlertTriangle, Plus } from 'lucide-react'
import { Alert, AlertDescription } from './components/ui/alert'
import { 
  validateInput, 
  sanitizeHtml, 
  isValidContent, 
  rateLimiter, 
  generateSecureId, 
  validateLength,
  validateForContext,
  auditLog
} from './utils/security'

interface Item {
  id: string
  text: string
  createdAt: number
  lastModified: number
}

interface SecurityState {
  isBlocked: boolean
  message: string
  attempts: number
}

function App() {
  const [items, setItems] = useState<Item[]>([])
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [security, setSecurity] = useState<SecurityState>({
    isBlocked: false,
    message: '',
    attempts: 0
  })

  // Security validation for input
  const validateAndSanitizeInput = useCallback((input: string): { isValid: boolean; sanitized: string; error?: string } => {
    // Rate limiting check
    if (!rateLimiter.isAllowed('crud_operations')) {
      auditLog('RATE_LIMIT_EXCEEDED', { input: input.substring(0, 50) });
      return {
        isValid: false,
        sanitized: '',
        error: 'Too many requests. Please wait before trying again.'
      };
    }

    // Length validation
    if (!validateLength(input, 500)) {
      auditLog('INPUT_TOO_LONG', { length: input.length });
      return {
        isValid: false,
        sanitized: '',
        error: 'Input is too long. Maximum 500 characters allowed.'
      };
    }

    // Content validation
    if (!validateInput(input)) {
      auditLog('MALICIOUS_INPUT_DETECTED', { input: input.substring(0, 100) });
      return {
        isValid: false,
        sanitized: '',
        error: 'Invalid input detected. Please check your content.'
      };
    }

    if (!isValidContent(input)) {
      auditLog('SUSPICIOUS_CONTENT_DETECTED', { input: input.substring(0, 100) });
      return {
        isValid: false,
        sanitized: '',
        error: 'Potentially unsafe content detected.'
      };
    }

    if (!validateForContext(input, 'text')) {
      auditLog('CONTEXT_VALIDATION_FAILED', { input: input.substring(0, 100) });
      return {
        isValid: false,
        sanitized: '',
        error: 'Content failed security validation.'
      };
    }

    // Sanitize the input
    const sanitized = sanitizeHtml(input.trim());
    
    return {
      isValid: true,
      sanitized
    };
  }, []);

  // Secure add item function
  const addItem = useCallback(() => {
    const validation = validateAndSanitizeInput(newItem);
    
    if (!validation.isValid) {
      setSecurity(prev => ({
        isBlocked: true,
        message: validation.error || 'Security validation failed',
        attempts: prev.attempts + 1
      }));
      
      // Auto-clear security message after 5 seconds
      setTimeout(() => {
        setSecurity(prev => ({ ...prev, isBlocked: false, message: '' }));
      }, 5000);
      
      return;
    }

    if (validation.sanitized) {
      const now = Date.now();
      const item: Item = {
        id: generateSecureId(),
        text: validation.sanitized,
        createdAt: now,
        lastModified: now
      };
      
      setItems(prev => [...prev, item]);
      setNewItem('');
      
      // Reset security state on successful operation
      setSecurity({ isBlocked: false, message: '', attempts: 0 });
      
      auditLog('ITEM_CREATED', { itemId: item.id, textLength: item.text.length });
    }
  }, [newItem, validateAndSanitizeInput]);

  // Secure delete function
  const deleteItem = useCallback((id: string) => {
    // Validate ID format to prevent injection
    if (typeof id !== 'string' || !id.match(/^\d+_[a-z0-9]+$/)) {
      auditLog('INVALID_DELETE_ID', { id });
      setSecurity({
        isBlocked: true,
        message: 'Invalid item identifier',
        attempts: 0
      });
      return;
    }

    if (!rateLimiter.isAllowed('delete_operations')) {
      auditLog('DELETE_RATE_LIMIT_EXCEEDED', { id });
      setSecurity({
        isBlocked: true,
        message: 'Too many delete requests. Please wait.',
        attempts: 0
      });
      return;
    }

    setItems(prev => prev.filter(item => item.id !== id));
    auditLog('ITEM_DELETED', { itemId: id });
  }, []);

  // Secure edit functions
  const startEditing = useCallback((item: Item) => {
    // Validate item object
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') {
      auditLog('INVALID_EDIT_ITEM', { item });
      return;
    }

    setEditingId(item.id);
    setEditingText(item.text);
    auditLog('EDIT_STARTED', { itemId: item.id });
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) return;

    const validation = validateAndSanitizeInput(editingText);
    
    if (!validation.isValid) {
      setSecurity({
        isBlocked: true,
        message: validation.error || 'Security validation failed',
        attempts: 0
      });
      
      setTimeout(() => {
        setSecurity(prev => ({ ...prev, isBlocked: false, message: '' }));
      }, 5000);
      
      return;
    }

    if (validation.sanitized) {
      setItems(prev => prev.map(item => 
        item.id === editingId 
          ? { ...item, text: validation.sanitized, lastModified: Date.now() }
          : item
      ));
      
      auditLog('ITEM_UPDATED', { itemId: editingId, textLength: validation.sanitized.length });
    }
    
    setEditingId(null);
    setEditingText('');
    setSecurity({ isBlocked: false, message: '', attempts: 0 });
  }, [editingId, editingText, validateAndSanitizeInput]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
    auditLog('EDIT_CANCELLED', { itemId: editingId });
  }, [editingId]);

  // Secure keyboard handlers
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !security.isBlocked) {
      e.preventDefault();
      addItem();
    }
  }, [addItem, security.isBlocked]);

  const handleEditKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !security.isBlocked) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [saveEdit, cancelEdit, security.isBlocked]);

  // Memoized security status
  const securityStatus = useMemo(() => {
    if (security.attempts > 3) {
      return { level: 'high', color: 'destructive' as const };
    } else if (security.attempts > 1) {
      return { level: 'medium', color: 'default' as const };
    }
    return { level: 'low', color: 'default' as const };
  }, [security.attempts]);

  // Input change handlers with security
  const handleNewItemChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Basic length check on input
    if (value.length > 500) {
      setSecurity({
        isBlocked: true,
        message: 'Input too long. Maximum 500 characters.',
        attempts: 0
      });
      return;
    }
    
    setNewItem(value);
    
    // Clear security message if user is typing normally
    if (security.isBlocked && value.length < 500) {
      setSecurity(prev => ({ ...prev, isBlocked: false, message: '' }));
    }
  }, [security.isBlocked]);

  const handleEditTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (value.length > 500) {
      setSecurity({
        isBlocked: true,
        message: 'Input too long. Maximum 500 characters.',
        attempts: 0
      });
      return;
    }
    
    setEditingText(value);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Main Application */}
        <main id="main-content" role="main">
          <Card className="shadow-lg">
            {/* Application Header */}
            <CardHeader className="text-center" role="banner">
              <CardTitle className="text-3xl font-semibold text-gray-900 flex items-center justify-center gap-2">
                <Shield className="h-8 w-8 text-blue-600" aria-hidden="true" />
                Secure CRUD App
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Create, read, update, and delete items with enterprise-grade security
              </p>
              <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" aria-hidden="true" />
                Protected against OWASP Top 10 vulnerabilities
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Security Alert Section */}
              {security.isBlocked && (
                <section aria-live="assertive" aria-atomic="true">
                  <Alert variant={securityStatus.color} role="alert">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>
                      <strong>Security Alert:</strong> {security.message}
                      {security.attempts > 1 && (
                        <span className="block text-xs mt-1">
                          Attempts: {security.attempts} | Rate limiting active
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                </section>
              )}

              {/* Add Item Form */}
              <section aria-labelledby="add-item-heading">
                <h2 id="add-item-heading" className="sr-only">Add New Item</h2>
                <form 
                  onSubmit={(e) => { e.preventDefault(); addItem(); }}
                  className="flex gap-3"
                  role="form"
                  aria-label="Add new item form"
                >
                  <div className="flex-1 relative">
                    <label htmlFor="new-item-input" className="sr-only">
                      Enter new item text (maximum 500 characters)
                    </label>
                    <Input
                      id="new-item-input"
                      type="text"
                      placeholder="Enter a new item... (max 500 chars)"
                      value={newItem}
                      onChange={handleNewItemChange}
                      onKeyPress={handleKeyPress}
                      className="pr-12"
                      disabled={security.isBlocked}
                      maxLength={500}
                      aria-describedby="char-count new-item-help"
                      aria-invalid={security.isBlocked}
                      autoComplete="off"
                      spellCheck="true"
                    />
                    <div 
                      id="char-count"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400"
                      aria-live="polite"
                    >
                      {newItem.length}/500
                    </div>
                    <div id="new-item-help" className="sr-only">
                      Enter text for your new item. Maximum 500 characters allowed.
                    </div>
                  </div>
                  <Button 
                    type="submit"
                    className="px-6"
                    disabled={!newItem.trim() || security.isBlocked}
                    aria-describedby="add-button-help"
                  >
                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                    Add
                  </Button>
                  <div id="add-button-help" className="sr-only">
                    Click to add the new item to your list
                  </div>
                </form>
              </section>

              {/* Items List */}
              <section aria-labelledby="items-list-heading">
                <h2 id="items-list-heading" className="sr-only">Your Items</h2>
                <div className="space-y-3" role="list" aria-label={`${items.length} items in your list`}>
                  {items.length === 0 ? (
                    <div className="text-center py-12 text-gray-500" role="status" aria-live="polite">
                      <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" aria-hidden="true" />
                      <p className="text-lg">No items yet</p>
                      <p className="text-sm">Add your first item above</p>
                    </div>
                  ) : (
                    items.map((item, index) => (
                      <article
                        key={item.id}
                        className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                        role="listitem"
                        aria-labelledby={`item-${item.id}-text`}
                        aria-describedby={`item-${item.id}-meta`}
                      >
                        {editingId === item.id ? (
                          <>
                            <div className="flex-1 relative">
                              <label htmlFor={`edit-input-${item.id}`} className="sr-only">
                                Edit item text (maximum 500 characters)
                              </label>
                              <Input
                                id={`edit-input-${item.id}`}
                                type="text"
                                value={editingText}
                                onChange={handleEditTextChange}
                                onKeyPress={handleEditKeyPress}
                                className="pr-12"
                                autoFocus
                                disabled={security.isBlocked}
                                maxLength={500}
                                aria-describedby={`edit-char-count-${item.id}`}
                                aria-invalid={security.isBlocked}
                                autoComplete="off"
                                spellCheck="true"
                              />
                              <div 
                                id={`edit-char-count-${item.id}`}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400"
                                aria-live="polite"
                              >
                                {editingText.length}/500
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={saveEdit}
                              className="p-2"
                              disabled={!editingText.trim() || security.isBlocked}
                              aria-label={`Save changes to item ${index + 1}`}
                              title="Save changes"
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                              className="p-2"
                              aria-label={`Cancel editing item ${index + 1}`}
                              title="Cancel editing"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="flex-1">
                              <span 
                                id={`item-${item.id}-text`}
                                className="text-gray-900 font-medium block"
                              >
                                {item.text}
                              </span>
                              <time 
                                id={`item-${item.id}-meta`}
                                className="text-xs text-gray-400"
                                dateTime={new Date(item.createdAt).toISOString()}
                              >
                                Created: {new Date(item.createdAt).toLocaleString()}
                                {item.lastModified !== item.createdAt && (
                                  <>
                                    {' • Modified: '}
                                    <time dateTime={new Date(item.lastModified).toISOString()}>
                                      {new Date(item.lastModified).toLocaleString()}
                                    </time>
                                  </>
                                )}
                              </time>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(item)}
                              className="p-2"
                              disabled={security.isBlocked}
                              aria-label={`Edit item ${index + 1}: ${item.text}`}
                              title="Edit this item"
                            >
                              <Edit2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteItem(item.id)}
                              className="p-2"
                              disabled={security.isBlocked}
                              aria-label={`Delete item ${index + 1}: ${item.text}`}
                              title="Delete this item"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>

              {/* Stats and Security Info */}
              {items.length > 0 && (
                <footer className="text-center text-sm text-gray-500 pt-4 border-t space-y-2" role="contentinfo">
                  <div aria-live="polite">
                    Total items: <strong>{items.length}</strong>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs" role="list" aria-label="Security features">
                    <span className="flex items-center gap-1" role="listitem">
                      <Shield className="h-3 w-3 text-green-500" aria-hidden="true" />
                      <span aria-label="Input sanitization active">Input Sanitized</span>
                    </span>
                    <span className="flex items-center gap-1" role="listitem">
                      <Shield className="h-3 w-3 text-blue-500" aria-hidden="true" />
                      <span aria-label="Cross-site scripting protection active">XSS Protected</span>
                    </span>
                    <span className="flex items-center gap-1" role="listitem">
                      <Shield className="h-3 w-3 text-purple-500" aria-hidden="true" />
                      <span aria-label="Rate limiting active">Rate Limited</span>
                    </span>
                  </div>
                </footer>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}

export default App