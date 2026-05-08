use std::thread;

fn main() {
    let numbers: Vec<u64> = (1..=1_000_000).collect();
    let thread_count = thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4);
    let chunk_size = numbers.len().div_ceil(thread_count);

    let mut handles = Vec::new();

    for chunk in numbers.chunks(chunk_size) {
        let chunk = chunk.to_vec();

        handles.push(thread::spawn(move || {
            chunk.iter().sum::<u64>()
        }));
    }

    let total: u64 = handles
        .into_iter()
        .map(|handle| handle.join().expect("worker thread failed"))
        .sum();

    println!("Used {thread_count} threads");
    println!("Sum from 1 to 1,000,000 is {total}");
}
