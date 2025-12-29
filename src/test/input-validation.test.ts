/**
 * ✅ BUG FIX #3: Testes críticos de validação de input
 * 
 * Validação de entradas do usuário para prevenir:
 * - XSS (Cross-Site Scripting)
 * - SQL Injection (não aplicável com RPC, mas validar mesmo assim)
 * - Buffer overflow
 * - Validações de negócio
 */

import { describe, it, expect } from 'vitest';
import { validateTransaction, validateCategory, validateAccount } from '@/lib/validators';

describe('Input Validation - Security (Bug Fix #3)', () => {
  
  describe('Transaction Validation', () => {
    it('✅ should reject XSS payloads in description', () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      expect(() => validateTransaction({
        description: xssPayload,
        amount: 100,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        account_id: '123e4567-e89b-12d3-a456-426614174000',
        category_id: '223e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
      })).toThrow('Caracteres inválidos detectados');
    });

    it('✅ should reject HTML injection in description', () => {
      const htmlPayload = '<img src=x onerror="alert(\'xss\')">';
      
      expect(() => validateTransaction({
        description: htmlPayload,
        amount: 100,
        type: 'expense',
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should reject negative amounts for expenses', () => {
      expect(() => validateTransaction({
        description: 'Valid',
        amount: -100,
        type: 'expense',
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should reject invalid transaction types', () => {
      expect(() => validateTransaction({
        description: 'Valid',
        amount: 100,
        type: 'invalid_type' as any,
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should reject future dates beyond reasonable range', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 100);
      
      expect(() => validateTransaction({
        description: 'Valid',
        amount: 100,
        type: 'expense',
        date: futureDate,
        account_id: 'acc-123',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should reject past dates beyond reasonable range', () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 100);
      
      expect(() => validateTransaction({
        description: 'Valid',
        amount: 100,
        type: 'expense',
        date: pastDate,
        account_id: 'acc-123',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should reject invalid UUIDs for account_id', () => {
      expect(() => validateTransaction({
        description: 'Valid',
        amount: 100,
        type: 'expense',
        date: new Date(),
        account_id: 'not-a-uuid',
        category_id: 'cat-123',
      })).toThrow();
    });

    it('✅ should accept valid transactions', () => {
      expect(() => validateTransaction({
        description: 'Valid transaction',
        amount: 100,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        account_id: '123e4567-e89b-12d3-a456-426614174000',
        category_id: '223e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
      })).not.toThrow();
    });
  });

  describe('Category Validation', () => {
    it('✅ should reject XSS payloads in category name', () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      expect(() => validateCategory({
        name: xssPayload,
        type: 'expense',
        color: '#00FF00',
        user_id: '123e4567-e89b-12d3-a456-426614174000',
      })).toThrow();
    });

    it('✅ should reject category names longer than 100 chars', () => {
      expect(() => validateCategory({
        name: 'a'.repeat(101),
        type: 'expense',
        color: '#00FF00',
      })).toThrow();
    });

    it('✅ should reject invalid colors', () => {
      expect(() => validateCategory({
        name: 'Valid',
        type: 'expense',
        color: 'not-a-hex-color',
      })).toThrow();
    });

    it('✅ should reject invalid category types', () => {
      expect(() => validateCategory({
        name: 'Valid',
        type: 'invalid_type' as any,
        color: '#00FF00',
      })).toThrow();
    });

    it('✅ should accept valid categories', () => {
      expect(() => validateCategory({
        name: 'Valid Category',
        type: 'expense',
        color: '#FF0000',
      })).not.toThrow();
    });
  });

  describe('Account Validation', () => {
    it('✅ should reject XSS payloads in account name', () => {
      const xssPayload = '<img src=x onerror="alert(\'xss\')">';
      
      expect(() => validateAccount({
        name: xssPayload,
        type: 'checking',
        balance: 1000,
        currency: 'BRL',
      })).toThrow();
    });

    it('✅ should reject account names longer than 100 chars', () => {
      expect(() => validateAccount({
        name: 'a'.repeat(101),
        type: 'checking',
        balance: 1000,
        currency: 'BRL',
      })).toThrow();
    });

    it('✅ should reject negative balances', () => {
      expect(() => validateAccount({
        name: 'Valid',
        type: 'checking',
        balance: -1000,
        currency: 'BRL',
      })).toThrow();
    });

    it('✅ should reject invalid account types', () => {
      expect(() => validateAccount({
        name: 'Valid',
        type: 'invalid_type' as any,
        balance: 1000,
        currency: 'BRL',
      })).toThrow();
    });

    it('✅ should reject invalid currency codes', () => {
      expect(() => validateAccount({
        name: 'Valid',
        type: 'checking',
        balance: 1000,
        currency: 'INVALID',
      })).toThrow();
    });

    it('✅ should accept valid accounts', () => {
      expect(() => validateAccount({
        name: 'My Checking Account',
        type: 'checking',
        balance: 5000.50,
        currency: 'BRL',
        color: '#000000',
      })).not.toThrow();
    });
  });

  describe('Sanitization', () => {
    it('✅ should sanitize common XSS vectors', () => {
      const xssVectors = [
        '<script>alert("xss")</script>',
        '<img src=x onerror="alert(\'xss\')">',
        '<svg onload="alert(\'xss\')">',
        '<iframe src="javascript:alert(\'xss\')">',
        '<body onload="alert(\'xss\')">',
      ];

      xssVectors.forEach((vector) => {
        expect(() => validateTransaction({
          description: vector,
          amount: 100,
          type: 'expense',
          date: new Date().toISOString().split('T')[0],
          account_id: '123e4567-e89b-12d3-a456-426614174000',
          category_id: '223e4567-e89b-12d3-a456-426614174000',
          status: 'completed',
        })).toThrow('Caracteres inválidos detectados');
      });
    });

    it('✅ should allow safe HTML entities', () => {
      expect(() => validateTransaction({
        description: 'Rent for apartment #123 & utilities',
        amount: 1000,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        account_id: '123e4567-e89b-12d3-a456-426614174000',
        category_id: '223e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
      })).not.toThrow();
    });
  });
});
