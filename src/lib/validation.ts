import { addTransactionSchema, addAccountSchema, addCategorySchema } from './validationSchemas';

export const validateTransaction = (data: any) => {
  return addTransactionSchema.parse(data);
};

export const validateAccount = (data: any) => {
  return addAccountSchema.parse(data);
};

export const validateCategory = (data: any) => {
  return addCategorySchema.parse(data);
};
