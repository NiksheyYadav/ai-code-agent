from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
import torch
import os

def load_training_data():
    """Load the training data from the tokyotech-llm/swallow-code dataset."""
    print("Loading tokyotech-llm/swallow-code dataset...")
    
    try:
        # Load the dataset with the specified configuration
        dataset = load_dataset("tokyotech-llm/swallow-code", "exp10-direct-sgcr")
        
        # The dataset might be split into train/validation/test
        # Let's combine them for now and split later
        if isinstance(dataset, dict):
            if 'train' in dataset:
                dataset = dataset['train']
            else:
                # If no 'train' split, take the first available split
                dataset = dataset[next(iter(dataset.keys()))]
        
        print(f"Loaded {len(dataset)} examples")
        
        # Filter out any examples with missing required fields
        required_columns = {'code', 'docstring'}
        if all(col in dataset.column_names for col in required_columns):
            dataset = dataset.filter(
                lambda x: all(x.get(col) is not None for col in required_columns)
            )
            print(f"After filtering: {len(dataset)} examples with all required fields")
        else:
            print("Warning: Not all required columns found in the dataset")
        
        return dataset
        
    except Exception as e:
        print(f"Error loading dataset: {e}")
        print("Falling back to sample data...")
        return load_sample_data()

def load_sample_data():
    """Load sample data as fallback."""
    from datasets import Dataset
    import pandas as pd
    
    print("Loading sample data...")
    
    # Sample data as fallback
    data = [
        {"docstring": "Add two numbers together", "code": "def add(a, b):\n    return a + b"},
        {"docstring": "Subtract b from a", "code": "def subtract(a, b):\n    return a - b"},
        {"docstring": "Multiply two numbers", "code": "def multiply(a, b):\n    return a * b"},
    ]
    
    df = pd.DataFrame(data)
    return Dataset.from_pandas(df)

def prepare_datasets(dataset, tokenizer):
    """Prepare the datasets for training."""
    print("Preparing datasets...")
    
    # Define the format function based on available columns
    def format_example(example):
        # Check which columns are available
        has_docstring = 'docstring' in example and example['docstring'] is not None
        has_code = 'code' in example and example['code'] is not None
        
        # Build the text input based on available fields
        parts = []
        if has_docstring:
            parts.append(example['docstring'])
        
        if has_code:
            code = example['code']
            # Add code block if it's not already in a code block
            if not code.strip().startswith('```'):
                code = f"```python\n{code}\n```"
            parts.append(code)
        
        # Fallback if neither docstring nor code is available
        if not parts:
            return {"text": ""}
        
        return {"text": "\n\n".join(parts)}
    
    # Format the dataset
    print("Formatting examples...")
    dataset = dataset.map(
        format_example,
        remove_columns=[col for col in dataset.column_names if col not in ["text"]]
    )
    
    # Filter out empty examples
    dataset = dataset.filter(lambda x: x["text"].strip() != "")
    
    # Tokenize the dataset
    print("Tokenizing dataset...")
    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=512,
            padding="max_length",
            return_tensors="pt"
        )
    
    tokenized_dataset = dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=["text"],
        desc="Tokenizing"
    )
    
    # Split into train and validation
    print("Splitting into train/validation sets...")
    if len(tokenized_dataset) > 10:  # Only split if we have enough examples
        split_dataset = tokenized_dataset.train_test_split(test_size=0.1)
        train_dataset = split_dataset["train"]
        eval_dataset = split_dataset["test"]
    else:
        # If we have very few examples, use all for training
        print("Warning: Not enough examples for validation split, using all for training")
        train_dataset = tokenized_dataset
        eval_dataset = None
    
    print(f"Training examples: {len(train_dataset)}")
    print(f"Validation examples: {len(eval_dataset) if eval_dataset else 0}")
    
    return train_dataset, eval_dataset

def train():
    # Load the dataset
    print("\n" + "="*50)
    print("Starting training process...")
    print("="*50 + "\n")
    
    dataset = load_training_data()
    
    # Model configuration - Using a smaller 100M parameter model
    model_name = "gpt2"  # gpt2 has 124M parameters (smallest in the GPT-2 family)
    print(f"\nLoading tokenizer and model: {model_name} (~124M parameters)")
    
    # Load tokenizer with special tokens if needed
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load model with configuration for a smaller model
    model_config = {
        'n_embd': 768,      # Smaller embedding size
        'n_layer': 6,       # Fewer layers
        'n_head': 12,       # Fewer attention heads
        'n_positions': 512, # Context length
        'vocab_size': 50257 # Standard GPT-2 vocab size
    }
    
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        config=model_config,
        use_cache=False,
        load_in_8bit=True if torch.cuda.is_available() else False,
        device_map="auto" if torch.cuda.is_available() else None
    )
    
    # Prepare datasets
    print("\nPreparing datasets...")
    train_dataset, eval_dataset = prepare_datasets(dataset, tokenizer)
    
    # Training arguments optimized for 100M parameter model
    training_args = TrainingArguments(
        output_dir="./results",
        overwrite_output_dir=True,
        evaluation_strategy="steps" if eval_dataset is not None else "no",
        eval_steps=500 if eval_dataset is not None else None,
        save_strategy="steps",
        save_steps=1000,
        save_total_limit=2,
        learning_rate=2e-5,  # Slightly lower learning rate for stability
        weight_decay=0.01,
        adam_beta1=0.9,
        adam_beta2=0.999,
        adam_epsilon=1e-8,
        max_grad_norm=1.0,
        per_device_train_batch_size=4,  # Increased batch size since model is smaller
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=2,  # Reduced since batch size is larger
        num_train_epochs=3,  # More epochs for better convergence
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,  # Using ratio instead of fixed steps for flexibility
        logging_dir="./logs",
        logging_steps=50,
        load_best_model_at_end=True if eval_dataset is not None else False,
        metric_for_best_model="loss" if eval_dataset is not None else None,
        greater_is_better=False,
        report_to="none",
        fp16=torch.cuda.is_available(),
        gradient_checkpointing=False,  # May not be needed for smaller model
        optim="adamw_torch",  # Explicit optimizer
        max_steps=-1,  # Let it run for full epochs
        dataloader_num_workers=0,  # Set to 0 to avoid multiprocessing issues
    )
    
    # Data collator
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    
    # Initialize Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
    )
    
    # Start training
    print("\n" + "="*50)
    print("Starting model training...")
    print(f"Training on {len(train_dataset)} examples")
    if eval_dataset is not None:
        print(f"Validating on {len(eval_dataset)} examples")
    print("="*50 + "\n")
    
    try:
        # Train the model
        trainer.train()
        
        # Save the model
        output_dir = "./trained_model"
        trainer.save_model(output_dir)
        tokenizer.save_pretrained(output_dir)
        print(f"\nModel successfully saved to {output_dir}")
        
    except Exception as e:
        print(f"\nError during training: {e}")
        print("Attempting to save model checkpoints before exiting...")
        try:
            output_dir = "./trained_model_checkpoint"
            trainer.save_model(output_dir)
            tokenizer.save_pretrained(output_dir)
            print(f"Model checkpoints saved to {output_dir}")
        except Exception as save_error:
            print(f"Failed to save checkpoints: {save_error}")
        
        raise  # Re-raise the exception to indicate failure

if __name__ == "__main__":
    # Set environment variable to avoid CUDA memory fragmentation
    import os
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:512"
    
    # Set to avoid tokenizers warning
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    
    # Start training
    train()
